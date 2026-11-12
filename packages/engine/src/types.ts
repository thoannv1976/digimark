// Public types shared by the API and the browser. This module must stay data-free:
// the browser imports it, so it must never pull in the question bank (answers).

export type GameId = 'ai-detective';

export type Category = 'spot' | 'light' | 'prompt' | 'kpi' | 'crisis' | 'gov';
export const CATEGORIES: Category[] = ['spot', 'light', 'prompt', 'kpi', 'crisis', 'gov'];
export const CATEGORY_LABEL: Record<Category, string> = {
  spot: 'Bắt lỗi AI',
  light: 'Đèn dữ liệu',
  prompt: 'Prompt',
  kpi: 'Đọc số liệu',
  crisis: 'Khủng hoảng',
  gov: 'Quản trị AI',
};

/** Error types players pick in "Bắt lỗi AI" (spot) questions. */
export type ErrorType = 'law' | 'date' | 'overclaim' | 'pii' | 'unsourced' | 'secret';
export const ERROR_TYPES: ErrorType[] = ['law', 'date', 'overclaim', 'pii', 'unsourced', 'secret'];
export const ERROR_TYPE_LABEL: Record<ErrorType, string> = {
  law: 'Sai số hiệu văn bản',
  date: 'Sai ngày hiệu lực / mốc thời gian',
  overclaim: 'Hứa hẹn quá mức',
  pii: 'Lộ thông tin khách hàng',
  unsourced: 'Số liệu không có nguồn',
  secret: 'Lộ thông tin mật doanh nghiệp',
};

export type QuestionKind = 'choice' | 'spot' | 'order';
export type BotLevel = 'easy' | 'medium' | 'hard';
export const BOT_LEVEL_LABEL: Record<BotLevel, string> = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' };

export interface DataTable {
  headers: string[];
  rows: string[][];
}

/** A question as the browser sees it: no answer key, options already shuffled. */
export interface PublicQuestion {
  id: string;
  kind: QuestionKind;
  category: Category;
  prompt: string;
  /** Longer text shown above the answer area (e.g. a data item, a prompt, a situation). */
  context?: string;
  table?: DataTable;
  timeLimitSec: number;
  /** choice: shuffled options. */
  options?: string[];
  /** spot: the AI-written text, split into tappable segments. */
  segments?: string[];
  /** order: shuffled steps. */
  items?: string[];
}

export type AnswerInput =
  | { kind: 'choice'; option: number }
  | { kind: 'spot'; seg: number; type: ErrorType }
  | { kind: 'order'; order: number[] };

/** Answer key in the shuffled (public) index space. */
export type AnswerKey =
  | { kind: 'choice'; option: number }
  | { kind: 'spot'; seg: number; type: ErrorType }
  | { kind: 'order'; order: number[] };

export type HintPayload =
  | { kind: 'choice'; removed: number[] }
  | { kind: 'spot'; type: ErrorType }
  | { kind: 'order'; first: number };

export type RoomStatus = 'lobby' | 'question' | 'reveal' | 'finished';

export interface CategoryStat {
  n: number;
  ok: number;
}

export interface PlayerPublic {
  id: string;
  name: string;
  bot: boolean;
  level?: BotLevel;
  score: number;
  correct: number;
  streak: number;
  bestStreak: number;
  hintsLeft: number;
  joinedAt: number;
  stats: Partial<Record<Category, CategoryStat>>;
}

export interface PlayerResult {
  answered: boolean;
  points: number;
  /** 0..1 share of the answer that was right. */
  fraction: number;
  input?: AnswerInput;
  hint?: boolean;
  /** ms after the question opened. */
  elapsedMs?: number;
}

export interface RevealPublic {
  qIndex: number;
  key: AnswerKey;
  explanation: string;
  source: string;
  results: Record<string, PlayerResult>;
  /** choice: how many players picked each option. */
  distribution?: number[];
  revealedAt: number;
}

export interface RoomSettings {
  questionCount: number;
  botLevel: BotLevel;
  /** Fill empty seats (up to 6) with bots when the game starts. */
  fillBots: boolean;
  categories: Category[];
  /** Seconds the answer stays on screen before the next question opens by itself; 0 = host presses "next". */
  autoNextSec: number;
}

export interface CurrentQuestion {
  q: PublicQuestion;
  openedAt: number;
  deadline: number;
  /** When each bot "presses" its answer (shown as answered in the UI; correctness stays private). */
  botAnswerAt: Record<string, number>;
}

export interface RoomDoc {
  code: string;
  game: GameId;
  title: string;
  status: RoomStatus;
  createdAt: number;
  /** True when the room creator is also a player (solo vs bots, or a self-run group). */
  hostPlays: boolean;
  hostPlayerId: string | null;
  settings: RoomSettings;
  players: Record<string, PlayerPublic>;
  order: string[];
  qIndex: number;
  qTotal: number;
  current: CurrentQuestion | null;
  answered: Record<string, boolean>;
  reveal: RevealPublic | null;
  startedAt: number | null;
  finishedAt: number | null;
  version: number;
}

export const MAX_SEATS = 6;
export const HINTS_PER_GAME = 2;
