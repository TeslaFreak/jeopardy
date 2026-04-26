/**
 * useGameSocket — manages the WebSocket connection to the JeopardyWsApi.
 *
 * Includes automatic reconnect with exponential backoff. When the socket
 * closes mid-game the hook waits 1 s, 2 s, 4 s … (capped at 16 s) before
 * retrying. On reconnect the backend detects the same player name and sends
 * a GAME_STATE_SYNC message to restore full game state.
 *
 * Usage:
 *   const { state, sendMessage, connect, disconnect } = useGameSocket();
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { WS_URL } from '../amplify-config';
import type { WsMessage, ServerAction, GameConfig } from '../types';

export type GamePhase = 'idle' | 'lobby' | 'active' | 'ended';

export interface PlayerInfo {
  connId: string;
  playerName: string;
  score: number;
}

export interface ActiveQuestion {
  clue: string;
  answer?: string; // only present for host
  categorySlug: string;
  categoryName: string;
  value: number;
}

export interface RevealedAnswer {
  answer: string;
  wasCorrect: boolean;
  correctPlayerName?: string;
}

export interface GameState {
  phase: GamePhase;
  roomCode: string | null;
  connId: string | null;
  players: PlayerInfo[];
  scores: Record<string, number>;
  board: { name: string; slug: string; questions: { value: number; clue: string; answer?: string }[] }[];
  activeQuestion: ActiveQuestion | null;
  buzzedPlayer: { playerId: string; playerName: string } | null;
  buzzDeadline: number | null;
  usedQuestions: string[];
  finalScores: Record<string, number> | null;
  config: GameConfig | null;
  failedBuzzPlayers: string[];
  stealDeadline: number | null;
  revealedAnswer: RevealedAnswer | null;
  isAllQuestionsComplete: boolean;
  error: string | null;
  isReconnecting: boolean;
}

const initialState: GameState = {
  phase: 'idle',
  roomCode: null,
  connId: null,
  players: [],
  scores: {},
  board: [],
  activeQuestion: null,
  buzzedPlayer: null,
  buzzDeadline: null,
  usedQuestions: [],
  finalScores: null,
  config: null,
  failedBuzzPlayers: [],
  stealDeadline: null,
  revealedAnswer: null,
  isAllQuestionsComplete: false,
  error: null,
  isReconnecting: false,
};

export function useGameSocket() {
  const [state, setState] = useState<GameState>(initialState);
  const wsRef = useRef<WebSocket | null>(null);

  // Reconnect bookkeeping
  const reconnectParamsRef = useRef<{ roomCode: string; playerName: string; isHost: boolean; role?: string } | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasOpenedRef = useRef(false);
  const connectRef = useRef<(roomCode: string, playerName: string, isHost: boolean, role?: string) => void>(() => {});

  const updateState = useCallback((partial: Partial<GameState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  const handleMessage = useCallback((action: ServerAction, payload: unknown) => {
    switch (action) {
      case 'PLAYER_JOINED': {
        const p = payload as { players: PlayerInfo[]; scores: Record<string, number> };
        setState(prev => ({
          ...prev,
          players: p.players,
          scores: p.scores,
          isReconnecting: false,
          phase: prev.phase === 'active' || prev.phase === 'ended' ? prev.phase : 'lobby',
        }));
        break;
      }
      case 'PLAYER_LEFT': {
        const p = payload as { playerId: string };
        setState(prev => ({
          ...prev,
          players: prev.players.filter(pl => pl.connId !== p.playerId),
        }));
        break;
      }
      case 'GAME_STARTED': {
        const p = payload as { board: GameState['board']; config: GameConfig };
        updateState({
          board: p.board,
          config: p.config,
          phase: 'active',
          activeQuestion: null,
          buzzedPlayer: null,
          buzzDeadline: null,
          failedBuzzPlayers: [],
          stealDeadline: null,
          revealedAnswer: null,
        });
        break;
      }
      case 'QUESTION_ACTIVE': {
        const p = payload as ActiveQuestion & { question: { clue: string; answer?: string } };
        updateState({
          activeQuestion: {
            clue: p.question.clue,
            answer: p.question.answer,
            categorySlug: p.categorySlug,
            categoryName: p.categoryName,
            value: p.value,
          },
          buzzedPlayer: null,
          buzzDeadline: null,
          failedBuzzPlayers: [],
          stealDeadline: null,
          revealedAnswer: null,
        });
        break;
      }
      case 'PLAYER_BUZZED': {
        const p = payload as { playerId: string; playerName: string; deadline?: number };
        updateState({
          buzzedPlayer: { playerId: p.playerId, playerName: p.playerName },
          buzzDeadline: p.deadline ?? null,
          stealDeadline: null,
        });
        break;
      }
      case 'SCORE_UPDATE': {
        const p = payload as { scores: Record<string, number> };
        updateState({ scores: p.scores });
        break;
      }
      case 'STEAL_OPEN': {
        const p = payload as { deadline: number; failedBuzzPlayers: string[] };
        updateState({
          stealDeadline: p.deadline,
          failedBuzzPlayers: p.failedBuzzPlayers,
          buzzedPlayer: null,
          buzzDeadline: null,
        });
        break;
      }
      case 'REVEAL_ANSWER': {
        const p = payload as RevealedAnswer;
        updateState({ revealedAnswer: p });
        break;
      }
      case 'BACK_TO_BOARD': {
        const p = payload as { usedQuestions: string[] };
        updateState({
          usedQuestions: p.usedQuestions,
          activeQuestion: null,
          buzzedPlayer: null,
          buzzDeadline: null,
          failedBuzzPlayers: [],
          stealDeadline: null,
          revealedAnswer: null,
        });
        break;
      }
      case 'GAME_OVER': {
        const p = payload as { finalScores?: Record<string, number>; allQuestionsComplete?: boolean };
        reconnectParamsRef.current = null;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        updateState({
          phase: 'ended',
          finalScores: p.finalScores ?? null,
          activeQuestion: null,
          buzzedPlayer: null,
          buzzDeadline: null,
          stealDeadline: null,
          isReconnecting: false,
          isAllQuestionsComplete: p.allQuestionsComplete ?? false,
        });
        break;
      }
      case 'GAME_STATE_SYNC': {
        type SyncPayload = {
          board: GameState['board'];
          usedQuestions: string[];
          scores: Record<string, number>;
          config?: GameConfig;
          failedBuzzPlayers?: string[];
          activeQuestion: {
            question: { clue: string; answer?: string };
            categorySlug: string;
            categoryName: string;
            value: number;
          } | null;
          buzzedPlayer: { playerId: string; playerName: string } | null;
        };
        const p = payload as SyncPayload;
        updateState({
          board: p.board,
          usedQuestions: p.usedQuestions,
          scores: p.scores,
          config: p.config ?? null,
          failedBuzzPlayers: p.failedBuzzPlayers ?? [],
          phase: 'active',
          isReconnecting: false,
          activeQuestion: p.activeQuestion
            ? {
                clue: p.activeQuestion.question.clue,
                answer: p.activeQuestion.question.answer,
                categorySlug: p.activeQuestion.categorySlug,
                categoryName: p.activeQuestion.categoryName,
                value: p.activeQuestion.value,
              }
            : null,
          buzzedPlayer: p.buzzedPlayer ?? null,
        });
        break;
      }
      case 'TV_STATE_SYNC': {
        type TvSyncPayload = {
          phase: GamePhase;
          players: PlayerInfo[];
          scores: Record<string, number>;
          board?: GameState['board'];
          usedQuestions?: string[];
          config?: GameConfig;
          failedBuzzPlayers?: string[];
          activeQuestion: {
            question: { clue: string; answer?: string };
            categorySlug: string;
            categoryName: string;
            value: number;
          } | null;
          buzzedPlayer?: { playerId: string; playerName: string } | null;
          finalScores?: Record<string, number>;
        };
        const p = payload as TvSyncPayload;
        setState(prev => ({
          ...prev,
          phase: p.phase,
          players: p.players,
          scores: p.scores,
          board: p.board ?? prev.board,
          usedQuestions: p.usedQuestions ?? prev.usedQuestions,
          config: p.config ?? prev.config,
          failedBuzzPlayers: p.failedBuzzPlayers ?? prev.failedBuzzPlayers,
          activeQuestion: p.activeQuestion
            ? {
                clue: p.activeQuestion.question.clue,
                answer: p.activeQuestion.question.answer,
                categorySlug: p.activeQuestion.categorySlug,
                categoryName: p.activeQuestion.categoryName,
                value: p.activeQuestion.value,
              }
            : null,
          buzzedPlayer: p.buzzedPlayer ?? null,
          finalScores: p.finalScores ?? null,
          isReconnecting: false,
        }));
        break;
      }
      case 'ERROR': {
        const p = payload as { message: string };
        updateState({ error: p.message });
        setTimeout(() => updateState({ error: null }), 4000);
        break;
      }
    }
  }, [updateState]);

  const connect = useCallback((
    roomCode: string,
    playerName: string,
    isHost: boolean,
    role?: string
  ) => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    reconnectParamsRef.current = { roomCode, playerName, isHost, role };
    hasOpenedRef.current = false;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = new URL(WS_URL);
    url.searchParams.set('roomCode', roomCode);
    url.searchParams.set('playerName', playerName);
    if (role) {
      url.searchParams.set('role', role);
    }
    url.searchParams.set('isHost', String(isHost));

    const ws = new WebSocket(url.toString());
    wsRef.current = ws;

    ws.onopen = () => {
      hasOpenedRef.current = true;
      const wasReconnecting = reconnectAttemptsRef.current > 0;
      reconnectAttemptsRef.current = 0;
      setState(prev => ({
        ...prev,
        roomCode,
        connId: null, // will be set if needed
        // TV stays in idle until TV_STATE_SYNC arrives; players set phase to lobby
        phase: role === 'tv'
          ? (wasReconnecting ? prev.phase : 'idle')
          : (wasReconnecting && prev.phase !== 'idle' ? prev.phase : 'lobby'),
        error: null,
        isReconnecting: false,
      }));
      if (!isHost && role !== 'tv') {
        sendMessage('JOIN_ROOM', { roomCode, playerName });
      }
      if (role === 'tv') {
        sendMessage('REQUEST_STATE_SYNC', {});
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        handleMessage(msg.action as ServerAction, msg.payload);
      } catch {
        console.error('Failed to parse WS message', event.data);
      }
    };

    ws.onerror = () => updateState({ error: 'Connection error' });

    ws.onclose = () => {
      setState(prev => {
        // Connection rejected before ever opening (e.g. room not found)
        if (!hasOpenedRef.current) {
          reconnectParamsRef.current = null;
          reconnectAttemptsRef.current = 0;
          return { ...initialState, error: 'Room not found' };
        }
        if (prev.phase === 'ended' || !reconnectParamsRef.current) {
          return prev.phase !== 'ended'
            ? { ...prev, error: 'Disconnected from server' }
            : prev;
        }
        const attempts = reconnectAttemptsRef.current;
        const delay = Math.min(1000 * Math.pow(2, attempts), 16000);
        reconnectAttemptsRef.current = attempts + 1;
        reconnectTimerRef.current = setTimeout(() => {
          const params = reconnectParamsRef.current;
          if (params) connectRef.current(params.roomCode, params.playerName, params.isHost, params.role);
        }, delay);
        return { ...prev, isReconnecting: true, error: null };
      });
    };
  }, [handleMessage, updateState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { connectRef.current = connect; }, [connect]);

  const sendMessage = useCallback((action: string, payload: unknown = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, payload }));
    }
  }, []);

  const disconnect = useCallback(() => {
    reconnectParamsRef.current = null;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setState(initialState);
  }, []);

  useEffect(() => () => {
    reconnectParamsRef.current = null;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    wsRef.current?.close();
  }, []);

  return { state, connect, disconnect, sendMessage };
}
