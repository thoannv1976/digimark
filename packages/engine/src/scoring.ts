import type { AnswerInput, AnswerKey } from './types.js';

export const BASE_POINTS = 1000;
/** Points lost for a fully wrong answer, so random tapping does not pay. */
export const WRONG_PENALTY = 200;
/** Using "Kiểm chứng" halves what the question can earn. */
export const HINT_FACTOR = 0.5;
/** Spot: right sentence, wrong error type. */
export const SPOT_SEGMENT_ONLY = 0.6;
export const STREAK_STEP = 0.1;
export const STREAK_MAX_STEPS = 5;

/** Share (0..1) of the answer that is right. */
export function gradeFraction(key: AnswerKey, input: AnswerInput | undefined): number {
  if (!input || input.kind !== key.kind) return 0;
  if (key.kind === 'choice' && input.kind === 'choice') return input.option === key.option ? 1 : 0;
  if (key.kind === 'spot' && input.kind === 'spot') {
    if (input.seg !== key.seg) return 0;
    return input.type === key.type ? 1 : SPOT_SEGMENT_ONLY;
  }
  if (key.kind === 'order' && input.kind === 'order') {
    const n = key.order.length;
    if (input.order.length !== n) return 0;
    let ok = 0;
    for (let i = 0; i < n; i++) if (input.order[i] === key.order[i]) ok++;
    return ok / n;
  }
  return 0;
}

/** 1.0 for an instant answer, 0.5 at the buzzer. */
export function speedFactor(elapsedMs: number, limitMs: number): number {
  const left = Math.min(1, Math.max(0, 1 - elapsedMs / limitMs));
  return 0.5 + 0.5 * left;
}

export function streakMultiplier(streakBefore: number): number {
  return 1 + STREAK_STEP * Math.min(Math.max(0, streakBefore), STREAK_MAX_STEPS);
}

export interface PointsInput {
  answered: boolean;
  fraction: number;
  elapsedMs: number;
  limitMs: number;
  hint: boolean;
  streakBefore: number;
}

export function computePoints(p: PointsInput): number {
  if (!p.answered) return 0;
  if (p.fraction <= 0) return -WRONG_PENALTY;
  const streak = p.fraction >= 1 ? streakMultiplier(p.streakBefore) : 1;
  const hint = p.hint ? HINT_FACTOR : 1;
  return Math.round(BASE_POINTS * p.fraction * speedFactor(p.elapsedMs, p.limitMs) * hint * streak);
}
