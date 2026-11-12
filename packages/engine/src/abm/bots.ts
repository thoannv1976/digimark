// Game 3 bots: five archetypes × three levels. Each month a greedy planner spends the 10 AP
// on the actions its archetype allows, valued with what the bot "believes" about each committee.
import type { BotLevel } from '../types.js';
import { shuffle, type Rng } from '../rng.js';
import { ranked, type HiddenFactory, type Pains } from './model.js';
import { grow, weightedRel, type AbmState } from './sim.js';
import {
  ACTIVITY_INFO,
  AP_PER_MONTH,
  CARDS_PER_BID,
  CLUSTERS,
  FACTORIES,
  FACTORY_IDS,
  MAX_BIDS,
  ROLES,
  THEMES,
  accessOf,
  type AbmAction,
  type AbmArchetype,
  type AbmBid,
  type AbmPlan,
  type AbmPrice,
  type AbmSpecial,
  type AbmSpecialChoice,
  type FactoryId,
  type Influence,
  type RoleId,
  type Theme,
} from './types.js';

export const ABM_ARCHETYPES: AbmArchetype[] = ['fair', 'spread', 'price', 'tech', 'abm'];

/** What a salesperson guesses without asking (common sense, not the truth of this factory). */
const GUESS_PAINS: Record<RoleId, Partial<Record<Theme, number>>> = {
  foreman: { tech: 0.5, quality: 0.3, stock: 0.2 },
  qc: { quality: 0.5, tech: 0.3, green: 0.2 },
  buyer: { price: 0.55, stock: 0.25, fx: 0.2 },
  cfo: { stock: 0.45, fx: 0.35, price: 0.2 },
  ceo: { quality: 0.4, green: 0.3, stock: 0.3 },
};
const GUESS_INFLUENCE: Record<RoleId, Influence> = { foreman: 2, qc: 1, buyer: 2, cfo: 2, ceo: 3 };
const full = (p: Partial<Record<Theme, number>>): Pains => ({ stock: 0, tech: 0, quality: 0, fx: 0, green: 0, price: 0, ...p });

/** The bot's picture of a committee: hard bots read it right (as after interviews), easy bots guess. */
function belief(h: HiddenFactory, level: BotLevel, rng: Rng): HiddenFactory {
  const pains = {} as Record<RoleId, Pains>;
  const influence = {} as Record<RoleId, Influence>;
  for (const r of ROLES) {
    const knows = level === 'hard' || (level === 'medium' && rng() < 0.7);
    pains[r] = knows ? h.pains[r] : full(GUESS_PAINS[r]);
    influence[r] = knows ? h.influence[r] : GUESS_INFLUENCE[r];
  }
  return { pains, influence, threshold: h.threshold };
}

/** Ideal-customer score of the case's sample rubric (instructor notes). */
export function idealScore(f: FactoryId): number {
  const x = FACTORIES[f];
  let s = x.demand >= 8000 ? 3 : x.demand >= 4000 ? 2 : 1;
  s += x.source === 'import' ? 2 : x.source === 'mixed' ? 1 : 0;
  if (x.eu) s += 1;
  if (/mở rộng|chứng nhận|hợp đồng/i.test(x.news)) s += 1;
  if (x.relation === 'met' || x.relation === 'trial') s += 1;
  return s;
}

/** Factories a bot works on for the whole game (chosen at the start). */
export function botTargets(arch: AbmArchetype, level: BotLevel, rng: Rng): FactoryId[] {
  if (arch === 'fair' || arch === 'spread') return FACTORY_IDS.slice();
  if (arch === 'abm') {
    const pool = FACTORY_IDS.filter((f) => f !== 'NM28' && f !== 'NM13').sort((a, b) => idealScore(b) - idealScore(a) || FACTORIES[b].demand - FACTORIES[a].demand);
    const n = level === 'hard' ? 5 : level === 'medium' ? 6 : 8;
    const from = level === 'easy' ? FACTORY_IDS.slice() : pool.slice(0, n);
    return shuffle(rng, from).slice(0, 3);
  }
  if (arch === 'tech') return shuffle(rng, FACTORY_IDS.filter((f) => FACTORIES[f].cluster !== 'woven')).slice(0, 4);
  return shuffle(rng, FACTORY_IDS).slice(0, 4);
}

type Rel = Record<FactoryId, Record<RoleId, number>>;

const KIND_LIMIT_KEY = (a: AbmAction) =>
  a.kind === 'interview' || a.kind === 'meet' ? `${a.kind}:${a.factory}:${a.role}` : a.factory ? `${a.kind}:${a.factory}` : a.kind === 'seminar' ? `seminar:${a.cluster}` : a.kind;

/** Expected effect of one action on the bot's believed relationship (rough copy of the simulation). */
function gainsOf(a: AbmAction, b: Record<FactoryId, HiddenFactory>, round: number): Array<[FactoryId, RoleId, number]> {
  const mult = (p: Pains, ts: Theme[]) => {
    const [x, y] = ranked(p);
    return ts.includes(x!) ? 1.5 : ts.includes(y!) ? 1 : 0.6;
  };
  const f = a.factory!;
  switch (a.kind) {
    case 'meet': {
      const [x, y] = ranked(b[f].pains[a.role!]);
      return [[f, a.role!, a.evidence === x ? 2 : a.evidence === y ? 1 : 0.5]];
    }
    case 'interview':
      return [[f, a.role!, 0.3]];
    case 'tco':
      return [
        [f, 'buyer', 0.8 * mult(b[f].pains.buyer, ['stock', 'fx', 'price'])],
        [f, 'cfo', 1.2 * mult(b[f].pains.cfo, ['stock', 'fx'])],
      ];
    case 'green': {
      const g = (FACTORIES[f].eu ? 1.3 : 1) * (round === 3 ? 1.3 : 1);
      return [
        [f, 'qc', g * mult(b[f].pains.qc, ['green', 'quality'])],
        [f, 'ceo', g * mult(b[f].pains.ceo, ['green'])],
      ];
    }
    case 'visit':
      return [[f, 'ceo', 1.4], ...(a.role ? ([[f, a.role, 0.8]] as Array<[FactoryId, RoleId, number]>) : [])];
    case 'trial':
      return [
        [f, 'foreman', 1.5 * mult(b[f].pains.foreman, ['tech', 'quality'])],
        [f, 'qc', mult(b[f].pains.qc, ['quality', 'tech'])],
      ];
    case 'seminar':
      return FACTORY_IDS.filter((x) => FACTORIES[x].cluster === a.cluster).flatMap((x) => [
        [x, 'foreman', 0.6 * mult(b[x].pains.foreman, ['tech'])] as [FactoryId, RoleId, number],
        [x, 'qc', 0.3 * mult(b[x].pains.qc, ['quality', 'tech'])] as [FactoryId, RoleId, number],
      ]);
    case 'bulletin':
      return (a.factories ?? []).flatMap((x) => [
        [x, 'buyer', 0.3 * mult(b[x].pains.buyer, ['price', 'fx'])] as [FactoryId, RoleId, number],
        [x, 'cfo', 0.3 * mult(b[x].pains.cfo, ['fx', 'price'])] as [FactoryId, RoleId, number],
      ]);
    case 'fair':
      return FACTORY_IDS.map((x) => [x, 'buyer', 0.15] as [FactoryId, RoleId, number]);
    case 'linkedin':
      return (a.factories ?? []).flatMap((x) => [[x, 'ceo', 0.25] as [FactoryId, RoleId, number], [x, 'cfo', 0.25] as [FactoryId, RoleId, number]]);
    default:
      return [];
  }
}

interface Ctx {
  arch: AbmArchetype;
  level: BotLevel;
  targets: FactoryId[];
  belief: Record<FactoryId, HiddenFactory>;
  round: number;
  rel: Rel;
  /** Stars at the start of the month: access is decided on these (as in the simulation). */
  start: Rel;
}

/** Candidate actions an archetype is willing to take this month. */
function candidates(c: Ctx): AbmAction[] {
  const out: AbmAction[] = [];
  const bestEvidence = (f: FactoryId, r: RoleId): Theme => {
    if (c.arch === 'price' || c.arch === 'fair') return r === 'cfo' ? 'fx' : 'price';
    if (c.arch === 'tech') return r === 'qc' ? 'quality' : 'tech';
    return ranked(c.belief[f].pains[r])[0]!;
  };
  const roleOk = (r: RoleId) =>
    c.arch === 'fair' ? r === 'buyer' : c.arch === 'price' ? r === 'buyer' || r === 'cfo' : c.arch === 'tech' ? r === 'foreman' || r === 'qc' : true;
  for (const f of c.targets) {
    const open = accessOf(f, c.start[f]);
    for (const r of ROLES) if (open[r] && roleOk(r)) out.push({ kind: 'meet', factory: f, role: r, evidence: c.arch === 'spread' ? THEMES[(f.charCodeAt(3) + r.length + c.round) % THEMES.length]! : bestEvidence(f, r) });
    if (c.arch === 'abm' || c.arch === 'price') out.push({ kind: 'tco', factory: f });
    if (c.arch === 'abm') {
      out.push({ kind: 'green', factory: f });
      const companion = ROLES.filter((r) => r !== 'ceo').sort((a, b) => c.belief[f].influence[b] - c.belief[f].influence[a])[0]!;
      out.push({ kind: 'visit', factory: f, role: companion });
    }
    if (c.arch === 'abm' || c.arch === 'tech') out.push({ kind: 'trial', factory: f });
  }
  if (c.arch === 'tech') for (const cl of CLUSTERS) if (c.targets.some((f) => FACTORIES[f].cluster === cl)) out.push({ kind: 'seminar', cluster: cl });
  if (c.arch === 'price' || c.arch === 'spread' || c.arch === 'fair') {
    const big = c.targets.slice().sort((a, b) => FACTORIES[b].demand - FACTORIES[a].demand).slice(0, 4);
    out.push({ kind: 'bulletin', factories: big });
  }
  if (c.arch === 'fair' || c.arch === 'spread') {
    out.push({ kind: 'linkedin', factories: c.targets.slice().sort((a, b) => FACTORIES[b].demand - FACTORIES[a].demand).slice(0, 3) });
  }
  if (c.arch === 'fair') out.push({ kind: 'fair' });
  return out;
}

/** Value of an action for the bot: believed influence-weighted star gain at its targets, per AP. */
function value(c: Ctx, a: AbmAction, rel: Rel): number {
  let v = 0;
  for (const [f, r, g0] of gainsOf(a, c.belief, c.round)) {
    const weight = c.targets.includes(f) ? 1 : c.arch === 'abm' ? 0 : 0.3;
    if (!weight) continue;
    const open = accessOf(f, c.start[f]);
    const g = g0 * (open[r] ? 1 : 0.5) * (c.round === 1 && r === 'buyer' ? 0.75 : 1);
    const h = c.belief[f];
    const sum = ROLES.reduce((x, y) => x + h.influence[y], 0);
    const cur = rel[f][r];
    // ABM players stop pushing a role that is already strong.
    const cap = c.arch === 'abm' ? 4.2 : 5;
    v += weight * (h.influence[r] / sum) * Math.max(0, Math.min(cap, grow(cur, g)) - Math.min(cap, cur));
    // Unlocking CFO/CEO is worth something for players who plan ahead.
    if ((c.arch === 'abm' || c.level === 'hard') && Math.max(...ROLES.map((x) => rel[f][x])) < 2 && grow(cur, g) >= 2) v += 0.15;
  }
  if (c.arch === 'fair' && a.kind === 'fair') v += 1; // the habit: the fair happens every month
  if (c.arch === 'spread') {
    // Spread players like to touch a new factory.
    const f = a.factory;
    if (f && ROLES.every((r) => rel[f][r] <= 1.5)) v *= 1.6;
  }
  return v / ACTIVITY_INFO[a.kind].ap;
}

function applyBelieved(c: Ctx, a: AbmAction, rel: Rel) {
  for (const [f, r, g0] of gainsOf(a, c.belief, c.round)) {
    const open = accessOf(f, c.start[f]);
    rel[f][r] = grow(rel[f][r], g0 * (open[r] ? 1 : 0.5));
  }
}

export function botPlan(
  arch: AbmArchetype,
  level: BotLevel,
  targets: FactoryId[],
  state: AbmState,
  id: string,
  round: number,
  special: AbmSpecial | null,
  rng: Rng,
): AbmPlan {
  const p = state.players[id]!;
  const b = {} as Record<FactoryId, HiddenFactory>;
  for (const f of FACTORY_IDS) b[f] = belief(state.hidden[f], level, rng);
  const rel = JSON.parse(JSON.stringify(p.rel)) as Rel;
  const c: Ctx = { arch, level, targets, belief: b, round, rel, start: p.rel };
  const actions: AbmAction[] = [];
  const used = new Set<string>();
  let ap = 0;
  const push = (a: AbmAction) => {
    actions.push(a);
    used.add(KIND_LIMIT_KEY(a));
    ap += ACTIVITY_INFO[a.kind].ap;
  };
  // ABM players interview first (month 1: the top roles of each target; later: a new role now open).
  if (arch === 'abm' && level !== 'easy') {
    for (const f of targets) {
      const open = accessOf(f, p.rel[f]);
      const known = p.known[f] ?? {};
      const r = ROLES.filter((x) => open[x] && !known[x]?.interviews).sort((x, y) => b[f].influence[y] - b[f].influence[x])[0];
      if (r && ap + 1 <= AP_PER_MONTH && (round === 1 || rng() < 0.5)) push({ kind: 'interview', factory: f, role: r });
    }
  }
  const waste = level === 'easy' ? 0.35 : level === 'medium' ? 0.1 : 0;
  for (let guard = 0; guard < 20 && ap < AP_PER_MONTH; guard++) {
    let list = candidates({ ...c, rel }).filter((a) => !used.has(KIND_LIMIT_KEY(a)) && ap + ACTIVITY_INFO[a.kind].ap <= AP_PER_MONTH);
    if (!list.length) break;
    if (rng() < waste) {
      push(list[Math.floor(rng() * list.length)]!);
      continue;
    }
    list = list.map((a) => ({ a, v: value(c, a, rel) })).sort((x, y) => y.v - x.v).map((x) => x.a);
    const best = list[0]!;
    if (value(c, best, rel) <= 0.0001) break;
    applyBelieved(c, best, rel);
    push(best);
  }
  let choice: AbmSpecialChoice | undefined;
  if (special) {
    const table: Record<AbmArchetype, AbmSpecialChoice> = { fair: 'discount', price: 'discount', spread: rng() < 0.5 ? 'discount' : 'tco', tech: rng() < 0.5 ? 'tco' : 'discount', abm: rng() < 0.5 ? 'tco' : 'cfo' };
    choice = level === 'hard' && arch !== 'price' ? (rng() < 0.5 ? 'tco' : 'cfo') : table[arch];
  }
  return { actions, ...(choice ? { special: choice } : {}) };
}

const COMBOS: Theme[][] = (() => {
  const out: Theme[][] = [];
  for (let i = 0; i < THEMES.length; i++) for (let j = i + 1; j < THEMES.length; j++) for (let k = j + 1; k < THEMES.length; k++) out.push([THEMES[i]!, THEMES[j]!, THEMES[k]!]);
  return out;
})();

function bestCards(h: HiddenFactory): Theme[] {
  const sum = ROLES.reduce((a, r) => a + h.influence[r], 0);
  let best = COMBOS[0]!;
  let bestV = -1;
  for (const combo of COMBOS) {
    const v = ROLES.reduce((a, r) => a + (h.influence[r] / sum) * Math.min(1, combo.reduce((x, t) => x + h.pains[r][t], 0)), 0);
    if (v > bestV) {
      bestV = v;
      best = combo;
    }
  }
  return best;
}

export function botBids(arch: AbmArchetype, level: BotLevel, targets: FactoryId[], state: AbmState, id: string, rng: Rng): AbmBid[] {
  const p = state.players[id]!;
  const pool = arch === 'fair' || arch === 'spread' ? FACTORY_IDS.slice() : targets.slice();
  const ranking = pool
    .map((f) => ({ f, w: weightedRel(state.hidden[f], p.rel[f]) }))
    .sort((a, b) => b.w - a.w || FACTORIES[b.f].demand - FACTORIES[a.f].demand);
  const n = arch === 'abm' ? Math.min(MAX_BIDS, targets.length + (level === 'easy' ? 1 : 0)) : MAX_BIDS;
  const chosen = ranking.slice(0, n).map((x) => x.f);
  return chosen.map((f) => {
    let price: AbmPrice = 'p3';
    if (arch === 'price') price = 'm2';
    else if (arch === 'spread') price = 'p15';
    else if (arch === 'abm' && level !== 'hard' && rng() < 0.4) price = 'p15';
    else if (level === 'easy' && rng() < 0.3) price = 'p0';
    let cards: Theme[];
    if (arch === 'abm') cards = bestCards(belief(state.hidden[f], level, rng));
    else if (arch === 'tech') cards = ['tech', 'quality', 'stock'];
    else if (arch === 'price') cards = ['price', 'fx', 'stock'];
    else if (arch === 'fair') cards = ['stock', 'tech', 'quality'];
    else cards = shuffle(rng, THEMES).slice(0, CARDS_PER_BID);
    return { factory: f, price, cards };
  });
}
