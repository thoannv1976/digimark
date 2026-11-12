import { randInt, shuffle, type Rng } from './rng.js';
import { ERROR_TYPES, type AnswerInput, type AnswerKey, type BotLevel, type PublicQuestion } from './types.js';

/** Chance a bot gets a question fully right (spot questions are a bit harder). */
export const BOT_ACCURACY: Record<BotLevel, number> = { easy: 0.6, medium: 0.72, hard: 0.85 };
export const BOT_SPOT_MALUS = 0.08;
/** When a bot answers, as a share of the time limit. */
export const BOT_TIME: Record<BotLevel, [number, number]> = { easy: [0.4, 0.9], medium: [0.3, 0.75], hard: [0.18, 0.55] };

export const BOT_NAMES = ['Minh', 'Lan', 'Hùng', 'Thu', 'Khoa', 'Vy', 'Nam', 'Hà', 'Phúc', 'Trang', 'Dũng'];
export const botDisplayName = (i: number): string => `${BOT_NAMES[i % BOT_NAMES.length]} (máy)`;

export interface BotPlan {
  at: number;
  input: AnswerInput;
}

export function planBotAnswer(level: BotLevel, pub: PublicQuestion, key: AnswerKey, openedAt: number, rng: Rng): BotPlan {
  const [lo, hi] = BOT_TIME[level];
  const share = lo + (hi - lo) * rng();
  const at = Math.round(openedAt + share * pub.timeLimitSec * 1000);
  const accuracy = BOT_ACCURACY[level] - (key.kind === 'spot' ? BOT_SPOT_MALUS : 0);
  const right = rng() < accuracy;
  return { at, input: right ? keyToInput(key) : wrongInput(pub, key, rng) };
}

function keyToInput(key: AnswerKey): AnswerInput {
  if (key.kind === 'choice') return { kind: 'choice', option: key.option };
  if (key.kind === 'spot') return { kind: 'spot', seg: key.seg, type: key.type };
  return { kind: 'order', order: key.order.slice() };
}

function wrongInput(pub: PublicQuestion, key: AnswerKey, rng: Rng): AnswerInput {
  if (key.kind === 'choice') {
    const wrong = (pub.options ?? []).map((_, i) => i).filter((i) => i !== key.option);
    return { kind: 'choice', option: wrong[randInt(rng, wrong.length)] ?? 0 };
  }
  if (key.kind === 'spot') {
    const otherTypes = ERROR_TYPES.filter((t) => t !== key.type);
    const n = pub.segments?.length ?? 1;
    // Half the time: right sentence, wrong type (partial credit). Otherwise a wrong sentence.
    if (rng() < 0.5 || n < 2) return { kind: 'spot', seg: key.seg, type: otherTypes[randInt(rng, otherTypes.length)] ?? 'law' };
    const otherSegs = Array.from({ length: n }, (_, i) => i).filter((i) => i !== key.seg);
    return { kind: 'spot', seg: otherSegs[randInt(rng, otherSegs.length)] ?? 0, type: ERROR_TYPES[randInt(rng, ERROR_TYPES.length)] ?? 'law' };
  }
  // Order: usually two neighbouring steps swapped (partial credit), sometimes a full guess.
  const order = key.order.slice();
  if (order.length < 2) return { kind: 'order', order };
  if (rng() < 0.75) {
    const i = randInt(rng, order.length - 1);
    [order[i], order[i + 1]] = [order[i + 1] as number, order[i] as number];
    return { kind: 'order', order };
  }
  let guess = shuffle(rng, order);
  if (guess.every((v, i) => v === key.order[i])) guess = [...guess.slice(1), guess[0] as number];
  return { kind: 'order', order: guess };
}
