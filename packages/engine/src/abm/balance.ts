// Game 3 balance simulation: bots play many games; who wins, how many contracts, what grade?
import type { BotLevel } from '../types.js';
import { mulberry32, seededRng, type Rng } from '../rng.js';
import { botBids, botPlan, botTargets } from './bots.js';
import { abmRanking, abmScorecard, initAbm, openMonth, resolveAwards, simulateMonth, specialFor, type MonthInput } from './sim.js';
import { gradeOf } from '../market/score.js';
import { MONTHS, type AbmArchetype, type AbmBid, type AbmSpecial, type FactoryId } from './types.js';

export interface AbmStrategy {
  archetype: AbmArchetype;
  level: BotLevel;
  /** Override the factories a bot works on (to test e.g. an all-in on NM28). */
  targets?: FactoryId[];
}

export interface AbmGameResult {
  rank: Record<string, number>;
  grade: Record<string, number>;
  scorecard: Record<string, number>;
  net: Record<string, number>;
  contracts: Record<string, number>;
  bidsBelow: Record<string, number>;
  wonBy: Record<FactoryId, string | null>;
}

export function playAbm(strategies: Record<string, AbmStrategy>, seed: number): AbmGameResult {
  const rng: Rng = mulberry32(seed);
  const order = Object.keys(strategies);
  const state = initAbm(order, seededRng(`hidden:${seed}`));
  const targets: Record<string, FactoryId[]> = {};
  for (const id of order) targets[id] = strategies[id]!.targets ?? botTargets(strategies[id]!.archetype, strategies[id]!.level, rng);
  for (let m = 1; m <= MONTHS; m++) {
    openMonth(state, m);
    const specials: Record<string, AbmSpecial | null> = {};
    for (const id of order) specials[id] = m === MONTHS ? specialFor(state, order, id) : null;
    const inputs: Record<string, MonthInput> = {};
    for (const id of order) inputs[id] = { plan: botPlan(strategies[id]!.archetype, strategies[id]!.level, targets[id]!, state, id, m, specials[id]!, rng), defaulted: false };
    simulateMonth(state, order, inputs, specials, m, rng);
  }
  const bids: Record<string, AbmBid[]> = {};
  for (const id of order) bids[id] = botBids(strategies[id]!.archetype, strategies[id]!.level, targets[id]!, state, id, rng);
  const awards = resolveAwards(state, order, bids);
  const rows = abmRanking(state, order, bids, awards);
  const res: AbmGameResult = { rank: {}, grade: {}, scorecard: {}, net: {}, contracts: {}, bidsBelow: {}, wonBy: {} as Record<FactoryId, string | null> };
  for (const id of order) {
    const won = awards.filter((a) => a.winner === id).length;
    const sc = abmScorecard(state.players[id]!, bids[id]!, won);
    res.rank[id] = rows[id]!.rank;
    res.scorecard[id] = sc.total;
    res.grade[id] = gradeOf(sc.total, rows[id]!.rank, order.length);
    res.net[id] = rows[id]!.net;
    res.contracts[id] = won;
    res.bidsBelow[id] = bids[id]!.filter((b) => b.price === 'm2').length;
  }
  for (const a of awards) res.wonBy[a.factory] = a.winner;
  return res;
}
