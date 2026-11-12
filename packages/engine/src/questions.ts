import { timeLimitOf, type BankQuestion } from './bank.js';
import { shuffle, type Rng } from './rng.js';
import { ERROR_TYPES, type AnswerInput, type AnswerKey, type Category, type HintPayload, type PublicQuestion } from './types.js';

/** Turn a bank entry into what players see plus the answer key in the shuffled index space. */
export function preparePublic(q: BankQuestion, rng: Rng): { pub: PublicQuestion; key: AnswerKey } {
  const base = {
    id: q.id,
    kind: q.kind,
    category: q.category,
    prompt: q.prompt,
    timeLimitSec: timeLimitOf(q),
    ...(q.context ? { context: q.context } : {}),
    ...(q.table ? { table: q.table } : {}),
  };
  if (q.kind === 'choice') {
    const idx = q.options.map((_, i) => i);
    const perm = q.fixedOrder ? idx : shuffle(rng, idx);
    return { pub: { ...base, options: perm.map((i) => q.options[i] as string) }, key: { kind: 'choice', option: perm.indexOf(q.answer) } };
  }
  if (q.kind === 'spot') {
    return { pub: { ...base, segments: q.segments.slice() }, key: { kind: 'spot', seg: q.answer.seg, type: q.answer.type } };
  }
  const idx = q.items.map((_, i) => i);
  let perm = shuffle(rng, idx);
  // Never show the steps already in the right order.
  for (let tries = 0; tries < 10 && perm.every((v, i) => v === i); tries++) perm = shuffle(rng, idx);
  if (perm.every((v, i) => v === i)) perm = [...idx.slice(1), 0];
  return {
    pub: { ...base, items: perm.map((i) => q.items[i] as string) },
    // key.order[k] = position (in the shuffled list) of the k-th right step.
    key: { kind: 'order', order: idx.map((k) => perm.indexOf(k)) },
  };
}

/** Reject answers that do not fit the question shape. */
export function isValidInput(pub: PublicQuestion, input: AnswerInput): boolean {
  if (input.kind !== pub.kind) return false;
  if (input.kind === 'choice') return Number.isInteger(input.option) && input.option >= 0 && input.option < (pub.options?.length ?? 0);
  if (input.kind === 'spot') {
    return Number.isInteger(input.seg) && input.seg >= 0 && input.seg < (pub.segments?.length ?? 0) && ERROR_TYPES.includes(input.type);
  }
  const n = pub.items?.length ?? 0;
  if (input.order.length !== n) return false;
  const seen = new Set(input.order);
  return seen.size === n && input.order.every((v) => Number.isInteger(v) && v >= 0 && v < n);
}

/** "Kiểm chứng": choice removes two wrong options, spot tells the error type, order gives the first step. */
export function buildHint(pub: PublicQuestion, key: AnswerKey, rng: Rng): HintPayload {
  if (key.kind === 'choice') {
    const wrong = (pub.options ?? []).map((_, i) => i).filter((i) => i !== key.option);
    const removeCount = Math.min(2, Math.max(0, wrong.length - 1));
    return { kind: 'choice', removed: shuffle(rng, wrong).slice(0, removeCount).sort((a, b) => a - b) };
  }
  if (key.kind === 'spot') return { kind: 'spot', type: key.type };
  return { kind: 'order', first: key.order[0] as number };
}

/** Pick `count` questions spread across the chosen categories, then mix them. */
export function selectQuestions(bank: readonly BankQuestion[], categories: readonly Category[], count: number, rng: Rng): BankQuestion[] {
  const cats = shuffle(rng, categories.length ? categories : Array.from(new Set(bank.map((q) => q.category))));
  const pools = new Map<Category, BankQuestion[]>();
  for (const c of cats) pools.set(c, shuffle(rng, bank.filter((q) => q.category === c)));
  const picked: BankQuestion[] = [];
  let progress = true;
  while (picked.length < count && progress) {
    progress = false;
    for (const c of cats) {
      const next = pools.get(c)?.pop();
      if (next) {
        picked.push(next);
        progress = true;
        if (picked.length >= count) break;
      }
    }
  }
  // Mix, but avoid three questions of the same category in a row where possible.
  const mixed = shuffle(rng, picked);
  for (let i = 2; i < mixed.length; i++) {
    const a = mixed[i - 2] as BankQuestion, b = mixed[i - 1] as BankQuestion, c = mixed[i] as BankQuestion;
    if (a.category === b.category && b.category === c.category) {
      const j = mixed.findIndex((q, k) => k > i && q.category !== c.category);
      if (j > 0) [mixed[i], mixed[j]] = [mixed[j] as BankQuestion, mixed[i] as BankQuestion];
    }
  }
  return mixed;
}
