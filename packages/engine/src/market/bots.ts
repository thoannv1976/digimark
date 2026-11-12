// Bot chains for Game 1: five archetypes × three levels.
import type { BotLevel } from '../types.js';
import { randInt, type Rng } from '../rng.js';
import { CARD_FACTOR, EVENTS, type Factor } from './model.js';
import type { PlayerState } from './sim.js';
import { emptyBudget } from './sim.js';
import { BUDGET_KEYS, BUDGET_STEP, CARDS, QUARTER_BUDGET, type Archetype, type BudgetKey, type CardId, type MarketDecision, type SegmentId } from './types.js';

export const ARCHETYPES: Archetype[] = ['price', 'ads', 'care', 'green', 'balanced'];

const TEMPLATE: Record<Archetype, { mix: Partial<Record<BudgetKey, number>>; position: CardId; targets: SegmentId[] }> = {
  price: { mix: { promo: 0.45, ads: 0.25, maps: 0.05, crm: 0.05, training: 0.1, app: 0.05, green: 0.05 }, position: 'price', targets: ['riders', 'households'] },
  ads: { mix: { ads: 0.55, promo: 0.05, maps: 0.05, crm: 0.05, training: 0.1, app: 0.1, green: 0.05, research: 0.05 }, position: 'fast', targets: ['riders', 'cars'] },
  care: { mix: { crm: 0.25, training: 0.25, maps: 0.15, app: 0.15, ads: 0.1, green: 0.05, research: 0.05 }, position: 'safe', targets: ['households', 'restaurants'] },
  green: { mix: { green: 0.4, ads: 0.15, app: 0.1, training: 0.1, maps: 0.1, crm: 0.05, research: 0.05, promo: 0.05 }, position: 'green', targets: ['ev', 'riders'] },
  balanced: { mix: { ads: 0.2, maps: 0.15, crm: 0.15, app: 0.15, training: 0.15, green: 0.1, research: 0.05, promo: 0.05 }, position: 'fivestar', targets: ['cars', 'households'] },
};

/** Event choice by archetype (medium); hard bots always pick the best practice. */
const EVENT_CHOICE: Record<string, Partial<Record<Archetype, string>> & { best: string }> = {
  e10: { price: 'overclaim', ads: 'overclaim', care: 'train', green: 'train', balanced: 'train', best: 'train' },
  swap: { price: 'wait', ads: 'wait', care: 'wait', green: 'build', balanced: 'partner', best: 'partner' },
  crisis: { price: 'none', ads: 'attack', care: 'review', green: 'review', balanced: 'review', best: 'review' },
  lez: { price: 'none', ads: 'cars', care: 'none', green: 'ev', balanced: 'cars', best: 'ev' },
  churn: { price: 'discount', ads: 'none', care: 'call', green: 'none', balanced: 'zalo', best: 'call' },
};

export function botDecision(archetype: Archetype, level: BotLevel, p: PlayerState, quarter: number, isCrisisTarget: boolean, rng: Rng): MarketDecision {
  const t = TEMPLATE[archetype];
  const event = EVENTS[quarter - 1];

  // Event choice and its cost.
  let eventChoice: string | undefined;
  let eventCost = 0;
  if (event) {
    const options = isCrisisTarget && event.special ? event.special.options : event.options;
    let id: string;
    if (isCrisisTarget && event.special) {
      id = level === 'hard' ? 'own' : level === 'medium' ? (rng() < 0.6 ? 'own' : 'wait') : options[randInt(rng, options.length)]!.id;
    } else if (level === 'easy') {
      id = options[randInt(rng, options.length)]!.id;
    } else {
      const table = EVENT_CHOICE[event.id];
      id = (level === 'hard' ? table?.best : table?.[archetype]) ?? options[options.length - 1]!.id;
    }
    const opt = options.find((o) => o.id === id) ?? options[options.length - 1]!;
    eventChoice = opt.id;
    eventCost = opt.cost;
  }

  // Budget mix with level noise.
  const spread = level === 'easy' ? 0.6 : level === 'medium' ? 0.2 : 0;
  const raw: Record<BudgetKey, number> = emptyBudget();
  let sum = 0;
  for (const k of BUDGET_KEYS) {
    const base = t.mix[k] ?? 0;
    const v = base * (1 + (rng() * 2 - 1) * spread);
    raw[k] = Math.max(0, v);
    sum += raw[k];
  }
  const available = Math.max(0, QUARTER_BUDGET - eventCost);
  const target = available * (level === 'easy' ? 0.85 : 1);
  const budget = emptyBudget();
  let used = 0;
  for (const k of BUDGET_KEYS) {
    const v = Math.floor(((raw[k] / Math.max(sum, 1e-9)) * target) / BUDGET_STEP + 1e-9) * BUDGET_STEP;
    budget[k] = Math.round(v * 10) / 10;
    used += budget[k];
  }
  // Put rounding leftovers into the archetype's main item.
  const main = (Object.entries(t.mix) as [BudgetKey, number][]).sort((a, b) => b[1] - a[1])[0]![0];
  const left = Math.round((available - used) * 10) / 10;
  if (level !== 'easy' && left >= BUDGET_STEP) budget[main] = Math.round((budget[main] + left) * 10) / 10;

  // Positioning.
  let position = t.position;
  if (level === 'easy' && rng() < 0.3) position = CARDS[randInt(rng, CARDS.length)]!;
  if (level === 'hard') {
    const seg = t.targets[0]!;
    const known = p.knownPrefs[seg];
    if (known) {
      const best = (Object.entries(known) as [Factor, number][]).filter(([k]) => k !== 'reviews').sort((a, b) => b[1] - a[1])[0]?.[0];
      const card = CARDS.find((c) => CARD_FACTOR[c] === best);
      if (card && archetype !== 'price') position = card;
    }
  }

  return { position, targets: t.targets.slice(), budget, ...(eventChoice ? { eventChoice } : {}) };
}
