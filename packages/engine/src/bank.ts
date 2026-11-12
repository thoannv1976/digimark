import type { Category, ErrorType } from './types.js';

/** Bank tables are written as plain rows; preparePublic turns them into Firestore-safe rows. */
export interface BankTable {
  headers: string[];
  rows: string[][];
}

/** Question bank entries (server-only: they carry the answers). */
interface BankBase {
  id: string;
  category: Category;
  prompt: string;
  context?: string;
  table?: BankTable;
  /** Shown after the answer: why the right answer is right. */
  explanation: string;
  /** Course material the question is based on. */
  source: string;
  timeLimitSec?: number;
}

export interface ChoiceQuestion extends BankBase {
  kind: 'choice';
  options: string[];
  /** Index of the right option in `options`. */
  answer: number;
  /** Keep option order (e.g. Xanh → Vàng → Đỏ → Đen, ascending numbers). */
  fixedOrder?: boolean;
}

export interface SpotQuestion extends BankBase {
  kind: 'spot';
  /** AI-written text split into tappable pieces; exactly one piece is wrong. */
  segments: string[];
  answer: { seg: number; type: ErrorType };
}

export interface OrderQuestion extends BankBase {
  kind: 'order';
  /** Steps in the right order (shuffled before they are shown). */
  items: string[];
}

export type BankQuestion = ChoiceQuestion | SpotQuestion | OrderQuestion;

export const DEFAULT_TIME_LIMIT: Record<BankQuestion['kind'], number> = { choice: 20, spot: 35, order: 35 };

export const timeLimitOf = (q: BankQuestion): number => q.timeLimitSec ?? DEFAULT_TIME_LIMIT[q.kind];
