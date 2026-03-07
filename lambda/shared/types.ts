// ─── Domain types ────────────────────────────────────────────────────────────

export interface GameSet {
  userId: string;
  setId: string;
  title: string;
  categories: Category[];
  createdAt: string;
  updatedAt: string;
}

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

export interface Room {
  roomCode: string;
  setId: string;
  hostConnId: string;
  status: 'lobby' | 'active' | 'ended';
  board?: Category[];
  usedQuestions: string[]; // `${categorySlug}#${value}`
  ttl: number;
}

export interface Player {
  connId: string;
  playerName: string;
  score: number;
  isHost: boolean;
}

// ─── WebSocket message actions ────────────────────────────────────────────────

export type ClientAction =
  | 'JOIN_ROOM'
  | 'START_GAME'
  | 'SELECT_QUESTION'
  | 'BUZZ_IN'
  | 'JUDGE_ANSWER'
  | 'END_GAME';

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
  | 'ERROR';

export interface WsMessage<T = unknown> {
  action: ClientAction | ServerAction;
  payload: T;
}

// ─── Client → Server payloads ─────────────────────────────────────────────────

export interface JoinRoomPayload {
  roomCode: string;
  playerName: string;
}

export interface SelectQuestionPayload {
  categorySlug: string;
  value: number;
}

export interface JudgeAnswerPayload {
  correct: boolean;
  playerId: string;
  value: number;
}

// ─── Server → Client payloads ─────────────────────────────────────────────────

export interface PlayerJoinedPayload {
  players: { connId: string; playerName: string; score: number; isHost: boolean }[];
  scores: Record<string, number>;
}

export interface GameStartedPayload {
  board: Category[];
}

export interface QuestionActivePayload {
  question: Question;
  categorySlug: string;
  categoryName: string;
  value: number;
}

export interface PlayerBuzzedPayload {
  playerId: string;
  playerName: string;
}

export interface ScoreUpdatePayload {
  scores: Record<string, number>;
}

export interface BackToBoardPayload {
  usedQuestions: string[];
}

export interface GameOverPayload {
  finalScores: Record<string, number>;
}
