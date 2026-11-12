// Balance simulation: bots (and scripted "good" strategies) play many games; who wins how often?
import type { BotLevel } from '../types.js';
import { mulberry32, type Rng } from '../rng.js';
import { botDecision } from './bots.js';
import { EVENTS } from './model.js';
import { emptyBudget, initMarket, marketLeader, simulateQuarter, type MarketState, type QuarterInput } from './sim.js';
import { gradeOf, scorecardOf, valueIndex } from './score.js';
import type { Archetype, MarketDecision } from './types.js';


export type Strategy = { kind: 'bot'; archetype: Archetype; level: BotLevel } | { kind: 'script'; name: string; decide: (q: number, crisis: boolean, state: MarketState, id: string) => MarketDecision };

/** A consistent, focused, data-informed plan (what the course teaches). */
export const SMART: Strategy = {
  kind: 'script',
  name: 'smart',
  decide: (q, crisis) => {
    const budget = emptyBudget();
    Object.assign(budget, q === 1 ? { research: 0.2, maps: 0.3, training: 0.3, crm: 0.3, app: 0.3, green: 0.3, ads: 0.3 } : { maps: 0.3, training: 0.3, crm: 0.3, app: 0.2, green: 0.4, ads: 0.3, research: 0 });
    const event = EVENTS[q - 1];
    const choice = event ? (crisis ? 'own' : ({ e10: 'train', swap: 'partner', crisis: 'review', lez: 'ev', churn: 'call' } as Record<string, string>)[event.id]) : undefined;
    const cost = event ? ((crisis ? event.special!.options : event.options).find((o) => o.id === choice)?.cost ?? 0) : 0;
    // keep total within budget
    let over = Math.round((Object.values(budget).reduce((a, b) => a + b, 0) + cost - 2) * 10) / 10;
    for (const k of ['ads', 'app', 'green'] as const) {
      while (over > 0 && budget[k] > 0) {
        budget[k] = Math.round((budget[k] - 0.1) * 10) / 10;
        over = Math.round((over - 0.1) * 10) / 10;
      }
    }
    return { position: 'fivestar', targets: ['cars', 'households'], budget, ...(choice ? { eventChoice: choice } : {}) };
  },
};

export interface GameResult {
  ranks: Record<string, number>;
  grades: Record<string, number>;
  scorecards: Record<string, number>;
  profit: Record<string, number>;
  share: Record<string, number>;
}

export function playGame(strategies: Record<string, Strategy>, seed: number, quarters = 5): GameResult {
  const rng: Rng = mulberry32(seed);
  const order = Object.keys(strategies);
  const state = initMarket(order);
  const lastNonfuel: Record<string, number> = {};
  for (let q = 1; q <= quarters; q++) {
    const event = EVENTS[q - 1];
    const crisisTarget = event?.special ? marketLeader(state, order) : null;
    const inputs: Record<string, QuarterInput> = {};
    for (const id of order) {
      const s = strategies[id]!;
      const decision = s.kind === 'bot' ? botDecision(s.archetype, s.level, state.players[id]!, q, crisisTarget === id, rng) : s.decide(q, crisisTarget === id, state, id);
      inputs[id] = { decision, defaulted: false };
    }
    const out = simulateQuarter(state, order, inputs, crisisTarget, rng);
    for (const id of order) lastNonfuel[id] = out.reports[id]!.kpis.nonfuelPct;
  }
  const vi = valueIndex(state, order);
  const res: GameResult = { ranks: {}, grades: {}, scorecards: {}, profit: {}, share: {} };
  for (const id of order) {
    const sc = scorecardOf(state, id, lastNonfuel[id]!);
    res.ranks[id] = vi[id]!.rank;
    res.scorecards[id] = sc.total;
    res.grades[id] = gradeOf(sc.total, vi[id]!.rank, order.length);
    res.profit[id] = Math.round(state.players[id]!.profitCum * 10) / 10;
    res.share[id] = Math.round(vi[id]!.share * 1000) / 10;
  }
  return res;
}
