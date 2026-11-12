// Quarter simulation for Game 1. Pure functions over MarketState.
import type { Rng } from '../rng.js';
import {
  CARD_FACTOR,
  EVENTS,
  FACTORS,
  NONFUEL_MARGIN,
  SEGMENT_MODEL,
  START,
  TUNE,
  type EventEffect,
  type EventModel,
} from './model.js';
import {
  BUDGET_KEYS,
  CAPABILITIES,
  SEGMENTS,
  SEGMENT_INFO,
  type BudgetKey,
  type Capability,
  type CardId,
  type MarketDecision,
  type QuarterKpis,
  type QuarterReport,
  type SegmentId,
} from './types.js';
import { feedbackNotes } from './feedback.js';

export interface PlayerState {
  caps: Record<Capability, number>;
  rating: number;
  awareness: number;
  crm: number;
  shares: Record<SegmentId, number>;
  customers: Record<SegmentId, number>;
  promoPrev: number;
  lastPosition: CardId | null;
  positionStreak: number;
  /** Investments that take effect next quarter (app, green). */
  pendingCaps: Partial<Record<Capability, number>>;
  /** Event consequences that land next quarter. */
  carry: { rating?: number; caps?: Partial<Record<Capability, number>>; news?: string; utility?: Partial<Record<SegmentId, number>> } | null;
  nonfuelKeep: number;
  repurchase: number;
  baselineGp: number;
  gpPrev: number;
  gpCum: number;
  spendCum: number;
  profitCum: number;
  revenueCum: number;
  nonfuelCum: number;
  crisis: number | null;
  /** True preferences revealed by research. */
  knownPrefs: Partial<Record<SegmentId, Record<string, number>>>;
  /** Last decision, to show competitors' budgets to researchers. */
  lastBudget: Record<BudgetKey, number> | null;
}

export interface MarketState {
  quarter: number;
  sizes: Record<SegmentId, number>;
  outsideU: Record<SegmentId, number>;
  players: Record<string, PlayerState>;
}

const f = (x: number, k: number) => 1 - Math.exp(-Math.max(0, x) / k);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const zeroSeg = (): Record<SegmentId, number> => ({ riders: 0, households: 0, restaurants: 0, cars: 0, ev: 0 });

export const emptyBudget = (): Record<BudgetKey, number> => ({ ads: 0, maps: 0, crm: 0, app: 0, training: 0, green: 0, promo: 0, research: 0 });

/** Attractiveness of one player for one segment. */
function utility(
  p: PlayerState,
  seg: SegmentId,
  d: MarketDecision,
  priceScore: number,
  consistency: number,
  extra: number,
): number {
  const m = SEGMENT_MODEL[seg];
  let u = 0;
  for (const c of CAPABILITIES) u += TUNE.capScale * m.weights[c] * (p.caps[c] / 10);
  u += m.weights.price * priceScore;
  u += m.weights.reviews * TUNE.reviewScale * (p.rating - 3.5);
  u += TUNE.fitScale * m.weights[CARD_FACTOR[d.position]] * consistency;
  const targeted = d.targets.includes(seg);
  const paidMult = d.targets.length === 0 ? 1 : targeted ? TUNE.targetPaid : TUNE.untargetedPaid;
  u += m.paid * TUNE.paidScale * (p.awareness / 100) * paidMult;
  if (targeted) u += TUNE.targetBonus + (p.knownPrefs[seg] ? TUNE.insightBonus : 0);
  return u + extra;
}

export const NEUTRAL_DECISION: MarketDecision = { position: 'fast', targets: [], budget: emptyBudget() };

function newPlayer(initialShare: number): PlayerState {
  const shares = zeroSeg();
  for (const s of SEGMENTS) shares[s] = initialShare;
  return {
    caps: { ...START.caps },
    rating: START.rating,
    awareness: START.awareness,
    crm: 0,
    shares,
    customers: zeroSeg(),
    promoPrev: 0,
    lastPosition: null,
    positionStreak: 0,
    pendingCaps: {},
    carry: null,
    nonfuelKeep: 1,
    repurchase: START.repurchase,
    baselineGp: 0,
    gpPrev: 0,
    gpCum: 0,
    spendCum: 0,
    profitCum: 0,
    revenueCum: 0,
    nonfuelCum: 0,
    crisis: null,
    knownPrefs: {},
    lastBudget: null,
  };
}

/** Start state: every player gets the same share; the rest of the market buys elsewhere. */
export function initMarket(playerIds: string[]): MarketState {
  const n = playerIds.length;
  const each = START.playersShare / 6; // same per-chain share whatever the number of chains
  const players: Record<string, PlayerState> = {};
  for (const id of playerIds) players[id] = newPlayer(each);
  const sizes = zeroSeg();
  const outsideU = zeroSeg();
  const probe = newPlayer(each);
  for (const s of SEGMENTS) {
    sizes[s] = SEGMENT_MODEL[s].size;
    const ub = utility(probe, s, NEUTRAL_DECISION, 0, 0.6, 0);
    const outsideShare = 1 - n * each;
    outsideU[s] = ub + Math.log(outsideShare / each) / TUNE.beta;
  }
  for (const id of playerIds) {
    const p = players[id]!;
    for (const s of SEGMENTS) p.customers[s] = sizes[s] * each;
    p.baselineGp = grossProfitOf(p, 1, zeroSeg(), 0).gp;
    p.gpPrev = p.baselineGp;
  }
  return { quarter: 0, sizes, outsideU, players };
}

function grossProfitOf(p: PlayerState, gpMult: number, segGpFactor: Record<SegmentId, number>, promoPoints: number) {
  let revenue = 0;
  let gp = 0;
  let nonfuel = 0;
  const nfFactor = 0.4 + 0.15 * p.caps.green;
  for (const s of SEGMENTS) {
    const m = SEGMENT_MODEL[s];
    const c = p.customers[s];
    revenue += (c * m.revenue) / 1000; // tỷ
    gp += ((c * m.grossProfit) / 1000) * (segGpFactor[s] || 1);
    nonfuel += (c * m.nonfuel * nfFactor) / 1000;
  }
  gp *= gpMult * (1 - TUNE.promoErosion * promoPoints);
  const nonfuelGp = nonfuel * NONFUEL_MARGIN * p.nonfuelKeep;
  return { revenue: revenue + nonfuel, gp: gp + nonfuelGp, nonfuel };
}

function addCaps(p: PlayerState, delta: Partial<Record<Capability, number>> | undefined, mult = 1) {
  if (!delta) return;
  for (const [k, v] of Object.entries(delta) as [Capability, number][]) p.caps[k] = clamp(p.caps[k] + v * mult, 0, 10);
}

export interface QuarterInput {
  decision: MarketDecision;
  defaulted: boolean;
}

export interface QuarterOutput {
  reports: Record<string, QuarterReport>;
  news: string[];
  outsideShare: number;
}

export function eventFor(quarter: number): EventModel | null {
  return EVENTS[quarter - 1] ?? null;
}

/** Leader of overall customer share (the crisis lands there). */
export function marketLeader(state: MarketState, order: string[]): string | null {
  let best: string | null = null;
  let bestC = -1;
  for (const id of order) {
    const p = state.players[id];
    if (!p) continue;
    const c = SEGMENTS.reduce((a, s) => a + p.customers[s], 0);
    if (c > bestC + 1e-9) {
      bestC = c;
      best = id;
    }
  }
  return best;
}

export function simulateQuarter(
  state: MarketState,
  order: string[],
  inputs: Record<string, QuarterInput>,
  crisisTarget: string | null,
  rng: Rng,
): QuarterOutput {
  state.quarter += 1;
  const q = state.quarter;
  const event = eventFor(q);
  const news: string[] = [];

  // Market-wide effects.
  for (const s of SEGMENTS) state.sizes[s] *= SEGMENT_MODEL[s].trend;
  if (event?.market) {
    for (const [s, k] of Object.entries(event.market.sizeFactor ?? {}) as [SegmentId, number][]) state.sizes[s] *= k;
    for (const [s, k] of Object.entries(event.market.outside ?? {}) as [SegmentId, number][]) state.outsideU[s] += k;
    news.push(event.market.news);
  }

  const util: Record<string, Record<SegmentId, number>> = {};
  const promoPts: Record<string, number> = {};
  const gpFactor: Record<string, Record<SegmentId, number>> = {};
  const eventResult: Record<string, string> = {};
  const spend: Record<string, number> = {};
  const loyaltyDrop: Record<string, Record<SegmentId, number>> = {};
  const research: Record<string, SegmentId[]> = {};

  for (const id of order) {
    const p = state.players[id]!;
    const { decision: d } = inputs[id]!;
    const b = d.budget;
    const extra = zeroSeg();
    gpFactor[id] = { riders: 1, households: 1, restaurants: 1, cars: 1, ev: 1 };
    loyaltyDrop[id] = zeroSeg();

    // Last quarter's consequences and lagged investments.
    if (p.carry) {
      if (p.carry.rating) p.rating += p.carry.rating;
      addCaps(p, p.carry.caps);
      for (const [s, v] of Object.entries(p.carry.utility ?? {}) as [SegmentId, number][]) extra[s] += v;
      if (p.carry.news) news.push(p.carry.news);
      p.carry = null;
    }
    addCaps(p, p.pendingCaps);
    p.pendingCaps = {};

    // Decay, then this quarter's investments.
    p.caps.service = clamp(p.caps.service - TUNE.decay.service, 0, 10);
    p.caps.trust = clamp(p.caps.trust - TUNE.decay.trust, 0, 10);
    p.rating -= TUNE.decay.rating;
    p.crm *= 1 - TUNE.crmDecay;

    addCaps(p, { service: 1.5 * f(b.training, 0.3), trust: 0.6 * f(b.training, 0.3), speed: 0.5 * f(b.training, 0.3) });
    addCaps(p, { digital: 0.5 * f(b.crm, 0.3), trust: 0.3 * f(b.crm, 0.3) });
    addCaps(p, { trust: 0.2 * f(b.maps, 0.25), speed: 0.3 * f(b.app, 0.4) });
    p.pendingCaps = { digital: 2.0 * f(b.app, 0.4), green: 2.0 * f(b.green, 0.7) };
    p.crm = clamp(p.crm + 0.3 * f(b.crm, 0.3), 0, 1);
    p.rating += 0.35 * f(b.maps, 0.3) + 0.03 * (p.caps.service - 3);
    p.awareness = Math.max(TUNE.awarenessFloor, p.awareness * TUNE.awarenessDecay + TUNE.awarenessGain * f(b.ads, TUNE.awarenessK));

    // Event choice.
    let eventCost = 0;
    if (event) {
      const special = event.special && crisisTarget === id ? event.special : null;
      const options = special ? special.options : event.options;
      const opt = options.find((o) => o.id === d.eventChoice) ?? options[options.length - 1]!;
      eventCost = opt.cost;
      applyEffect(p, opt.effect, extra, gpFactor[id]!, q);
      eventResult[id] = opt.effect.result;
      if (opt.effect.crisis !== undefined) p.crisis = opt.effect.crisis;
    }
    if (event?.market?.churn) {
      const ch = event.market.churn;
      if (p.crm < ch.crmThreshold) for (const s of ch.segments) loyaltyDrop[id]![s] = ch.drop;
    }

    p.rating = clamp(p.rating, 1, 5);
    p.awareness = clamp(p.awareness, 0, 100);

    // Positioning consistency.
    p.positionStreak = p.lastPosition === d.position ? p.positionStreak + 1 : 1;
    p.lastPosition = d.position;
    const consistency = Math.min(1, 0.4 + 0.2 * p.positionStreak);

    // Price: promo now, minus the memory of past promos (customers get used to discounts).
    const pts = TUNE.promoPoints * f(b.promo, TUNE.promoK);
    const priceScore = pts - TUNE.promoMemory * p.promoPrev;
    promoPts[id] = pts;
    p.promoPrev = pts;

    // Research reveals true preferences of targeted segments.
    research[id] = [];
    if (b.research >= 0.1 - 1e-9) {
      const segs = d.targets.length ? d.targets.slice(0, b.research >= 0.2 - 1e-9 ? 2 : 1) : [];
      for (const s of segs) {
        const w: Record<string, number> = {};
        for (const k of FACTORS) w[k] = round(SEGMENT_MODEL[s].weights[k], 2);
        p.knownPrefs[s] = w;
        research[id]!.push(s);
      }
    }

    util[id] = zeroSeg();
    for (const s of SEGMENTS) util[id]![s] = utility(p, s, d, priceScore, consistency, extra[s]);
    spend[id] = BUDGET_KEYS.reduce((a, k) => a + b[k], 0) + eventCost;
  }

  // Shares: softmax against the outside option, then customer inertia.
  const prevTotal: Record<string, number> = {};
  for (const id of order) prevTotal[id] = SEGMENTS.reduce((a, s) => a + state.players[id]!.customers[s], 0);
  let outsideTotal = 0;
  let sizeTotal = 0;
  for (const s of SEGMENTS) {
    const noise = 1 + (rng() - 0.5) * 0.04;
    let denom = Math.exp(TUNE.beta * state.outsideU[s]);
    for (const id of order) denom += Math.exp(TUNE.beta * util[id]![s]);
    const mixed: Record<string, number> = {};
    let sum = 0;
    for (const id of order) {
      const p = state.players[id]!;
      const fresh = Math.exp(TUNE.beta * util[id]![s]) / denom;
      const m = SEGMENT_MODEL[s];
      const lambda = clamp(m.inertia + 0.3 * p.crm + 0.02 * p.caps.digital - loyaltyDrop[id]![s], 0.1, 0.85);
      mixed[id] = lambda * p.shares[s] + (1 - lambda) * fresh;
      sum += mixed[id]!;
    }
    const scale = sum > 0.97 ? 0.97 / sum : 1;
    for (const id of order) {
      const p = state.players[id]!;
      p.shares[s] = mixed[id]! * scale;
      p.customers[s] = Math.round(state.sizes[s] * p.shares[s] * noise);
    }
    outsideTotal += state.sizes[s] * (1 - sum * scale);
    sizeTotal += state.sizes[s];
  }

  // Money and KPIs.
  const reports: Record<string, QuarterReport> = {};
  for (const id of order) {
    const p = state.players[id]!;
    const input = inputs[id]!;
    const prevCustomers = prevTotal[id]!;
    const money = grossProfitOf(p, 1, gpFactor[id]!, promoPts[id]!);
    const customers = SEGMENTS.reduce((a, s) => a + p.customers[s], 0);
    const newCustomers = Math.max(0, customers - Math.round(prevCustomers * 0.6));
    const sp = spend[id]!;
    const profit = money.gp - sp;
    p.repurchase = clamp(0.57 + 0.1 * p.crm + 0.005 * (p.caps.speed - 4) + 0.004 * (p.caps.digital - 2) + (p.repurchase - 0.57) * 0.3, 0.4, 0.9);
    p.gpCum += money.gp;
    p.spendCum += sp;
    p.profitCum += profit;
    p.revenueCum += money.revenue;
    p.nonfuelCum += money.nonfuel;
    const acquisition = input.decision.budget.ads + input.decision.budget.promo + 0.5 * input.decision.budget.maps;
    const segShares = zeroSeg();
    for (const s of SEGMENTS) segShares[s] = round(p.shares[s], 4);
    const kpis: QuarterKpis = {
      customers,
      newCustomers,
      share: round(customers / sizeTotal, 4),
      segShares,
      segCustomers: { ...p.customers },
      revenue: round(money.revenue, 2),
      grossProfit: round(money.gp, 2),
      nonfuelRevenue: round(money.nonfuel, 3),
      nonfuelPct: round(money.nonfuel / Math.max(1e-9, money.revenue), 4),
      spend: round(sp, 2),
      profit: round(profit, 2),
      roi: sp > 0 ? round((money.gp - p.baselineGp - sp) / sp, 3) : null,
      cac: newCustomers > 0 && acquisition > 0 ? round((acquisition * 1e9) / newCustomers / 1e3, 0) : null, // nghìn đồng / khách mới
      repurchase: round(p.repurchase, 3),
      rating: round(p.rating, 2),
      awareness: round(p.awareness, 1),
      caps: Object.fromEntries(CAPABILITIES.map((c) => [c, round(p.caps[c], 1)])) as Record<Capability, number>,
    };
    const insights = research[id]!.map((s) => `Nghiên cứu khách hàng: đã biết sở thích thật của phân khúc “${SEGMENT_INFO[s].name}” (xem ở bước chọn phân khúc).`);
    reports[id] = {
      quarter: q,
      decision: input.decision,
      defaulted: input.defaulted,
      kpis,
      notes: feedbackNotes({ decision: input.decision, kpis, prevGp: p.gpPrev, player: p, quarter: q }),
      insights,
      ...(eventResult[id] ? { eventResult: eventResult[id] } : {}),
    };
    p.gpPrev = money.gp;
    p.lastBudget = { ...input.decision.budget };
  }
  // Several chains can trigger the same headline; the market feed shows it once.
  return { reports, news: Array.from(new Set(news)), outsideShare: round(outsideTotal / sizeTotal, 4) };
}

function applyEffect(p: PlayerState, e: EventEffect, extra: Record<SegmentId, number>, gpF: Record<SegmentId, number>, quarter: number) {
  void quarter;
  const soften = e.softenedByService ? 1 - Math.min(0.4, 0.04 * p.caps.service) : 1;
  addCaps(p, e.caps, (e.caps && Object.values(e.caps).some((v) => v < 0)) ? soften : 1);
  if (e.rating) p.rating += e.rating < 0 ? e.rating * soften : e.rating;
  if (e.awareness) p.awareness += e.awareness;
  if (e.crm) p.crm = clamp(p.crm + e.crm, 0, 1);
  if (e.repurchase) p.repurchase += e.repurchase;
  for (const [s, v] of Object.entries(e.utility ?? {}) as [SegmentId, number][]) extra[s] += v < 0 ? v * soften : v;
  for (const [s, v] of Object.entries(e.gpFactor ?? {}) as [SegmentId, number][]) gpF[s] = v;
  if (e.nonfuelKeep !== undefined) p.nonfuelKeep = e.nonfuelKeep;
  if (e.next || e.nextUtility) {
    p.carry = {
      ...(e.next?.rating !== undefined ? { rating: e.next.rating } : {}),
      ...(e.next?.caps ? { caps: e.next.caps } : {}),
      ...(e.next?.news ? { news: e.next.news } : {}),
      ...(e.nextUtility ? { utility: e.nextUtility } : {}),
    };
  }
}
