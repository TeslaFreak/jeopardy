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
import type { WsMessage, ServerAction } from '../types';

export type GamePhase = 'idle' | 'lobby' | 'active' | 'ended';

export interface PlayerInfo {
  connId: string;
  playerName: string;
  score: number;
  isHost: boolean;
}

export interface ActiveQuestion {
  clue: string;
  answer: string;
  categorySlug: string;
  categoryName: string;
  value: number;
}

export interface GameState {
  phase: GamePhase;
  roomCode: string | null;
  players: PlayerInfo[];
  scores: Record<string, number>;
  board: { name: string; slug: string; questions: { value: number; clue: string; answer: string }[] }[];
  activeQuestion: ActiveQuestion | null;
  buzzedPlayer: { playerId: string; playerName: string } | null;
  usedQuestions: string[];
  finalScores: Record<string, number> | null;
  error: string | null;
  isReconnecting: boolean;
}

const initialState: GameState = {
  phase: 'idle',
  roomCode: null,
  players: [],
  scores: {},
  board: [],
  activeQuestion: null,
  buzzedPlayer: null,
  usedQuestions: [],
  finalScores: null,
  error: null,
  isReconnecting: false,
};

export function useGameSocket() {
  const [state, setState] = useState<GameState>(initialState);
  const wsRef = useRef<WebSocket | null>(null);

  // Reconnect bookkeeping
  const reconnectParamsRef = useRef<{ roomCode: string; playerName: string; isHost: boolean } | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable ref to connect so ws.onclose can invoke it without a circular dep
  const connectRef = useRef<(roomCode: string, playerName: string, isHost: boolean) => void>(() => {});

  const updateState = useCallback((partial: Partial<GameState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  const handleMessage = useCallback((action: ServerAction, payload: unknown) => {
    switch (action) {
      case 'PLAYER_JOINED': {
        const p = payload as { players: PlayerInfo[]; scores: Record<string, number> };
        // Preserve phase if game is already active or ended (e.g. reconnect)
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
        const p = payload as { board: GameState['board'] };
        updateState({ board: p.board, phase: 'active', activeQuestion: null, buzzedPlayer: null });
        break;
      }
      case 'QUESTION_ACTIVE': {
        const p = payload as ActiveQuestion & { question: { clue: string; answer: string } };
        updateState({
          activeQuestion: {
            clue: p.question.clue,
            answer: p.question.answer,
            categorySlug: p.categorySlug,
            categoryName: p.categoryName,
            value: p.value,
          },
          buzzedPlayer: null,
        });
        break;
      }
      case 'PLAYER_BUZZED': {
        const p = payload as { playerId: string; playerName: string };
        updateState({ buzzedPlayer: p });
        break;
      }
      case 'SCORE_UPDATE': {
        const p = payload as { scores: Record<string, number> };
        updateState({ scores: p.scores });
        break;
      }
      case 'BACK_TO_BOARD': {
        const p = payload as { usedQuestions: string[] };
        updateState({ usedQuestions: p.usedQuestions, activeQuestion: null, buzzedPlayer: null });
        break;
      }
      case 'GAME_OVER': {
        const p = payload as { finalScores: Record<string, number> };
        // Stop any pending reconnect — game is over
        reconnectParamsRef.current = null;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        updateState({ phase: 'ended', finalScores: p.finalScores, activeQuestion: null, isReconnecting: false });
        break;
      }
      case 'GAME_STATE_SYNC': {
        // Full state restoration sent by the server after a successful reconnect
        type SyncPayload = {
          board: GameState['board'];
          usedQuestions: string[];
          scores: Record<string, number>;
          activeQuestion: {
            question: { clue: string; answer: string };
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
    isHost: boolean
  ) => {
    // Cancel any pending reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Save params for auto-reconnect
    reconnectParamsRef.current = { roomCode, playerName, isHost };

    // Close any existing socket without triggering auto-reconnect
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = new URL(WS_URL);
    url.searchParams.set('roomCode', roomCode);
    url.searchParams.set('playerName', playerName);
    url.searchParams.set('isHost', String(isHost));

    const ws = new WebSocket(url.toString());
    wsRef.current = ws;

    ws.onopen = () => {
      // If this is a reconnect attempt (attempts > 0), preserve the current game
      // phase — GAME_STATE_SYNC will refresh it. Resetting to 'lobby' would cause
      // a visible flash of the waiting screen before the sync arrives.
      const wasReconnecting = reconnectAttemptsRef.current > 0;
      reconnectAttemptsRef.current = 0;
      setState(prev => ({
        ...prev,
        roomCode,
        phase: wasReconnecting && prev.phase !== 'idle' ? prev.phase : 'lobby',
        error: null,
        isReconnecting: false,
      }));
      if (!isHost) {
        sendMessage('JOIN_ROOM', { roomCode, playerName });
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
        if (prev.phase === 'ended' || !reconnectParamsRef.current) {
          return prev.phase !== 'ended'
            ? { ...prev, error: 'Disconnected from server' }
            : prev;
        }
        // Exponential backoff: 1 s, 2 s, 4 s, 8 s, 16 s (max)
        const attempts = reconnectAttemptsRef.current;
        const delay = Math.min(1000 * Math.pow(2, attempts), 16000);
        reconnectAttemptsRef.current = attempts + 1;
        reconnectTimerRef.current = setTimeout(() => {
          const params = reconnectParamsRef.current;
          if (params) connectRef.current(params.roomCode, params.playerName, params.isHost);
        }, delay);
        return { ...prev, isReconnecting: true, error: null };
      });
    };
  }, [handleMessage, updateState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep connectRef in sync so ws.onclose always calls the latest version
  useEffect(() => { connectRef.current = connect; }, [connect]);

  const sendMessage = useCallback((action: string, payload: unknown = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, payload }));
    }
  }, []);

  const disconnect = useCallback(() => {
    reconnectParamsRef.current = null; // disable auto-reconnect
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
