/**
 * Shared game types — a frontend-local copy of lambda/shared/types.ts.
 * Keep in sync with lambda/shared/types.ts.
 */

export interface Category {
  name: string;
  slug: string;
  questions: Question[];
}

export interface Question {
  value: 100 | 200 | 300 | 400 | 500;
  clue: string;
  answer: string;
}

// ─── Game config ────────────────────────────────────────────────────────────────

export interface TimerSetting {
  enabled: boolean;
  seconds: number;
}

export interface GameConfig {
  buzzInTimer: TimerSetting;
  stealTimer: TimerSetting;
  wrongAnswerPenalty: 'subtract' | 'nothing';
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  buzzInTimer: { enabled: true, seconds: 20 },
  stealTimer: { enabled: true, seconds: 10 },
  wrongAnswerPenalty: 'subtract',
};

// ─── Connection role ────────────────────────────────────────────────────────────

export type ConnectionRole = 'host' | 'player' | 'tv';

// ─── WebSocket message actions ──────────────────────────────────────────────────

export type ClientAction =
  | 'JOIN_ROOM'
  | 'START_GAME'
  | 'SELECT_QUESTION'
  | 'BUZZ_IN'
  | 'JUDGE_ANSWER'
  | 'END_GAME'
  | 'STEAL_EXPIRED'
  | 'BUZZ_TIMER_EXPIRED';

export type ServerAction =
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'GAME_STARTED'
  | 'QUESTION_ACTIVE'
  | 'PLAYER_BUZZED'
  | 'SCORE_UPDATE'
  | 'BACK_TO_BOARD'
  | 'GAME_OVER'
  | 'GAME_STATE_SYNC'
  | 'STEAL_OPEN'
  | 'REVEAL_ANSWER'
  | 'ERROR';

export interface WsMessage<T = unknown> {
  action: ClientAction | ServerAction;
  payload: T;
}
