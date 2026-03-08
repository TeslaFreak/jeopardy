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

// ─── Room & player ──────────────────────────────────────────────────────────────

export interface Room {
  roomCode: string;
  setId: string;
  hostConnId: string;
  status: 'lobby' | 'active' | 'ended';
  board?: Category[];
  usedQuestions: string[]; // `${categorySlug}#${value}`
  config?: GameConfig;
  failedBuzzPlayers: string[]; // connIds who already guessed wrong on current question
  activeQuestion?: { categorySlug: string; value: number } | null;
  buzzedConnId?: string | null;
  ttl: number;
}

export interface Player {
  connId: string;
  playerName: string;
  score: number;
  role: ConnectionRole;
}

// ─── WebSocket message actions ────────────────────────────────────────────────

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

export interface StartGamePayload {
  config?: Partial<GameConfig>;
}

// ─── Server → Client payloads ─────────────────────────────────────────────────

export interface PlayerJoinedPayload {
  players: { connId: string; playerName: string; score: number; role: ConnectionRole }[];
  scores: Record<string, number>;
}

export interface GameStartedPayload {
  board: Category[];
  config: GameConfig;
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
  deadline?: number; // epoch ms when buzz-in timer expires
}

export interface ScoreUpdatePayload {
  scores: Record<string, number>;
}

export interface BackToBoardPayload {
  usedQuestions: string[];
}

export interface GameOverPayload {
  finalScores: Record<string, number>;
  allQuestionsComplete?: boolean;
}

export interface StealOpenPayload {
  deadline: number; // epoch ms when steal timer expires
  failedBuzzPlayers: string[];
}

export interface RevealAnswerPayload {
  answer: string;
  wasCorrect: boolean;
  correctPlayerName?: string;
}
