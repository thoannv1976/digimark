// Room state machine for Game 1 (pure; the API loads/saves it in a Firestore transaction).
import { GameError, type LmsBinding, type LmsResult } from '../room.js';
import { randomToken, seededRng, shuffle, type Rng } from '../rng.js';
import { MAX_SEATS, type BotLevel } from '../types.js';
import { ARCHETYPES, botDecision } from './bots.js';
import { EVENTS } from './model.js';
import { emptyBudget, eventFor, initMarket, marketLeader, simulateQuarter, type MarketState, type QuarterInput } from './sim.js';
import { gradeOf, scorecardOf, valueIndex, valueShare } from './score.js';
import {
  BUDGET_INFO,
  BUDGET_KEYS,
  BUDGET_STEP,
  CARDS,
  QUARTER_BUDGET,
  SEGMENTS,
  type Archetype,
  type MarketDecision,
  type MarketEventPublic,
  type MarketMe,
  type MarketPlayerPublic,
  type MarketRoomDoc,
  type MarketSettings,
  type QuarterReport,
  type SegmentId,
} from './types.js';

export interface MarketPrivate {
  hostToken: string;
  tokens: Record<string, string>;
  lti?: Record<string, LmsBinding>;
  state: MarketState | null;
  archetypes: Record<string, Archetype>;
  /** This quarter's submissions (humans). */
  decisions: Record<string, MarketDecision>;
  lastDecisions: Record<string, MarketDecision>;
  reports: Record<string, QuarterReport[]>;
  crisisTarget: string | null;
  lastNonfuel: Record<string, number>;
}

export const DEFAULT_MARKET_SETTINGS: MarketSettings = { quarters: 5, decideSec: 300, resultsSec: 0, botLevel: 'medium', fillBots: true };

export function normalizeMarketSettings(s: Partial<MarketSettings> | undefined): MarketSettings {
  const int = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  return {
    quarters: int(s?.quarters, 3, EVENTS.length, DEFAULT_MARKET_SETTINGS.quarters),
    decideSec: s?.decideSec === 0 ? 0 : int(s?.decideSec, 60, 900, DEFAULT_MARKET_SETTINGS.decideSec),
    resultsSec: int(s?.resultsSec ?? 0, 0, 300, 0),
    botLevel: s?.botLevel && ['easy', 'medium', 'hard'].includes(s.botLevel) ? s.botLevel : 'medium',
    fillBots: s?.fillBots ?? true,
  };
}

const BOT_NAMES = ['Sao Mai', 'Đông Phương', 'Hòa Bình', 'Kim Long', 'Phú Thịnh', 'An Khang'];

export function createMarketRoom(
  input: { code: string; title?: string; hostPlays: boolean; hostName?: string; settings?: Partial<MarketSettings>; hostLms?: LmsBinding },
  now: number,
  rng: Rng,
) {
  const room: MarketRoomDoc = {
    code: input.code,
    game: 'market-share',
    title: (input.title ?? '').trim().slice(0, 40) || `Phòng ${input.code}`,
    status: 'lobby',
    createdAt: now,
    hostPlays: input.hostPlays,
    hostPlayerId: null,
    settings: normalizeMarketSettings(input.settings),
    players: {},
    order: [],
    quarter: 0,
    quarters: 0,
    openedAt: null,
    deadline: null,
    event: null,
    submitted: {},
    standings: {},
    history: [],
    news: [],
    revealedAt: null,
    startedAt: null,
    finishedAt: null,
    version: 1,
  };
  room.quarters = room.settings.quarters;
  const priv: MarketPrivate = {
    hostToken: randomToken(rng),
    tokens: {},
    state: null,
    archetypes: {},
    decisions: {},
    lastDecisions: {},
    reports: {},
    crisisTarget: null,
    lastNonfuel: {},
  };
  let player: { playerId: string; playerToken: string } | null = null;
  if (input.hostPlays) {
    player = joinMarket(room, priv, input.hostName ?? '', now, rng, input.hostLms);
    room.hostPlayerId = player.playerId;
  }
  return { room, priv, hostToken: priv.hostToken, player };
}

function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!name) throw new GameError('bad_name', 'Vui lòng nhập tên.');
  return name;
}

export function joinMarket(room: MarketRoomDoc, priv: MarketPrivate, rawName: string, now: number, rng: Rng, lms?: LmsBinding) {
  if (lms) {
    const seat = Object.entries(priv.lti ?? {}).find(([, b]) => b.hubUserId === lms.hubUserId)?.[0];
    if (seat && room.players[seat] && priv.tokens[seat]) return { playerId: seat, playerToken: priv.tokens[seat] as string };
  }
  if (room.status !== 'lobby') throw new GameError('started', 'Trận đã bắt đầu, không vào thêm được.', 409);
  if (room.order.length >= MAX_SEATS) throw new GameError('full', 'Phòng đã đủ 6 người.', 409);
  let name = cleanName(rawName);
  const taken = new Set(Object.values(room.players).map((p) => p.name.toLowerCase()));
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${cleanName(rawName).slice(0, 20)} (${i})`;
  const playerId = `p${room.order.length + 1}_${randomToken(rng, 6)}`;
  room.players[playerId] = { id: playerId, name, bot: false, joinedAt: now, ...(lms?.gradeTarget ? { lms: true } : {}) };
  if (lms) priv.lti = { ...(priv.lti ?? {}), [playerId]: lms };
  room.order.push(playerId);
  const playerToken = randomToken(rng);
  priv.tokens[playerId] = playerToken;
  room.version++;
  return { playerId, playerToken };
}

export function removeMarketPlayer(room: MarketRoomDoc, priv: MarketPrivate, playerId: string) {
  if (room.status !== 'lobby') throw new GameError('started', 'Chỉ xóa được người chơi khi chưa bắt đầu.', 409);
  if (!room.players[playerId]) throw new GameError('no_player', 'Không có người chơi này.', 404);
  if (playerId === room.hostPlayerId) throw new GameError('host', 'Không thể xóa chủ phòng.', 409);
  delete room.players[playerId];
  delete priv.tokens[playerId];
  if (priv.lti) delete priv.lti[playerId];
  room.order = room.order.filter((id) => id !== playerId);
  room.version++;
}

const humansOf = (room: MarketRoomDoc) => room.order.filter((id) => !room.players[id]?.bot);

export function startMarket(room: MarketRoomDoc, priv: MarketPrivate, now: number, rng: Rng) {
  if (room.status !== 'lobby') throw new GameError('started', 'Trận đã bắt đầu.', 409);
  if (humansOf(room).length === 0) throw new GameError('empty', 'Phòng chưa có người chơi.', 409);
  if (room.settings.fillBots) {
    const kinds = shuffle(rng, ARCHETYPES);
    let i = 0;
    while (room.order.length < MAX_SEATS) {
      const id = `b${i + 1}`;
      const archetype = kinds[i % kinds.length]!;
      room.players[id] = { id, name: `${BOT_NAMES[i % BOT_NAMES.length]} (máy)`, bot: true, level: room.settings.botLevel, archetype, joinedAt: now };
      priv.archetypes[id] = archetype;
      room.order.push(id);
      i++;
    }
  }
  priv.state = initMarket(room.order);
  room.startedAt = now;
  for (const id of room.order) priv.reports[id] = [];
  openQuarter(room, priv, 1, now);
}

function openQuarter(room: MarketRoomDoc, priv: MarketPrivate, q: number, now: number) {
  const state = priv.state!;
  const ev = eventFor(q);
  priv.crisisTarget = ev?.special ? marketLeader(state, room.order) : null;
  let event: MarketEventPublic | null = null;
  if (ev) {
    event = {
      id: ev.id,
      quarter: q,
      title: ev.title,
      text: ev.text,
      options: ev.options.map(({ id, label, cost }) => ({ id, label, cost })),
      ...(ev.special && priv.crisisTarget
        ? { special: { playerId: priv.crisisTarget, title: ev.special.title, text: ev.special.text, options: ev.special.options.map(({ id, label, cost }) => ({ id, label, cost })) } }
        : {}),
    };
  }
  room.status = 'decide';
  room.quarter = q;
  room.openedAt = now;
  room.deadline = room.settings.decideSec > 0 ? now + room.settings.decideSec * 1000 : null;
  room.event = event;
  room.submitted = {};
  room.revealedAt = null;
  priv.decisions = {};
  room.version++;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Validates and normalises a decision (budget steps of 0.1 tỷ, within the quarter budget). */
export function validateDecision(room: MarketRoomDoc, priv: MarketPrivate, playerId: string, raw: MarketDecision): MarketDecision {
  if (!CARDS.includes(raw.position)) throw new GameError('bad_input', 'Chưa chọn định vị.');
  const targets = Array.from(new Set(raw.targets ?? [])).filter((s): s is SegmentId => SEGMENTS.includes(s));
  if (targets.length > 2) throw new GameError('bad_input', 'Chọn tối đa 2 phân khúc mục tiêu.');
  const budget = emptyBudget();
  let sum = 0;
  for (const k of BUDGET_KEYS) {
    const v = Number(raw.budget?.[k] ?? 0);
    if (!Number.isFinite(v) || v < 0) throw new GameError('bad_input', 'Ngân sách không hợp lệ.');
    budget[k] = round1(Math.round(v / BUDGET_STEP) * BUDGET_STEP);
    sum += budget[k];
  }
  let eventChoice: string | undefined;
  let cost = 0;
  if (room.event) {
    const special = room.event.special?.playerId === playerId ? room.event.special : null;
    const options = special ? special.options : room.event.options;
    const opt = options.find((o) => o.id === raw.eventChoice);
    if (!opt) throw new GameError('bad_input', 'Chưa chọn cách phản ứng với sự kiện của quý.');
    eventChoice = opt.id;
    cost = opt.cost;
  }
  if (round1(sum + cost) > QUARTER_BUDGET + 1e-9) throw new GameError('over_budget', `Vượt ngân sách: ${round1(sum + cost)} / ${QUARTER_BUDGET} tỷ.`);
  return { position: raw.position, targets, budget, ...(eventChoice ? { eventChoice } : {}) };
}

/** Returns true when this submission closed the quarter (everyone has decided). */
export function submitDecision(room: MarketRoomDoc, priv: MarketPrivate, playerId: string, quarter: number, raw: MarketDecision, now: number): boolean {
  if (room.status !== 'decide') throw new GameError('not_open', 'Quý này đã đóng.', 409);
  if (quarter !== room.quarter) throw new GameError('stale', 'Đã sang quý khác.', 409);
  const p = room.players[playerId];
  if (!p || p.bot) throw new GameError('no_player', 'Không có người chơi này.', 404);
  if (room.deadline !== null && now > room.deadline + 2000) throw new GameError('late', 'Hết giờ quyết định.', 409);
  priv.decisions[playerId] = validateDecision(room, priv, playerId, raw);
  room.submitted[playerId] = true;
  room.version++;
  if (humansOf(room).every((id) => priv.decisions[id])) {
    closeQuarter(room, priv, now);
    return true;
  }
  return false;
}

/** What a player who did not submit plays: last quarter's choices (quarter 1: a balanced default). */
function defaultDecision(room: MarketRoomDoc, priv: MarketPrivate, playerId: string): MarketDecision {
  const last = priv.lastDecisions[playerId];
  const budget = last ? { ...last.budget } : { ...emptyBudget(), ads: 0.3, maps: 0.3, crm: 0.3, app: 0.3, training: 0.3, green: 0.2, research: 0.1 };
  let eventChoice: string | undefined;
  let cost = 0;
  if (room.event) {
    const special = room.event.special?.playerId === playerId ? room.event.special : null;
    const options = special ? special.options : room.event.options;
    const opt = options[options.length - 1]!; // "không làm gì"/least active option
    eventChoice = opt.id;
    cost = opt.cost;
  }
  // Keep within budget after the event cost.
  let over = round1(BUDGET_KEYS.reduce((a, k) => a + budget[k], 0) + cost - QUARTER_BUDGET);
  for (const k of [...BUDGET_KEYS].reverse()) {
    while (over > 0 && budget[k] > 0) {
      budget[k] = round1(budget[k] - BUDGET_STEP);
      over = round1(over - BUDGET_STEP);
    }
  }
  return { position: last?.position ?? 'fivestar', targets: last?.targets ?? [], budget, ...(eventChoice ? { eventChoice } : {}) };
}

export function closeQuarter(room: MarketRoomDoc, priv: MarketPrivate, now: number) {
  if (room.status !== 'decide' || !priv.state) throw new GameError('not_open', 'Quý này đã đóng.', 409);
  const q = room.quarter;
  const rng = seededRng(`${room.code}:${room.startedAt}:market:${q}`);
  const inputs: Record<string, QuarterInput> = {};
  for (const id of room.order) {
    const p = room.players[id]!;
    if (p.bot) {
      inputs[id] = { decision: botDecision(priv.archetypes[id] ?? 'balanced', p.level ?? 'medium', priv.state.players[id]!, q, priv.crisisTarget === id, rng), defaulted: false };
    } else if (priv.decisions[id]) {
      inputs[id] = { decision: priv.decisions[id]!, defaulted: false };
    } else {
      inputs[id] = { decision: defaultDecision(room, priv, id), defaulted: true };
    }
  }
  const out = simulateQuarter(priv.state, room.order, inputs, priv.crisisTarget, rng);
  for (const id of room.order) {
    priv.reports[id] = [...(priv.reports[id] ?? []), out.reports[id]!];
    priv.lastDecisions[id] = inputs[id]!.decision;
    priv.lastNonfuel[id] = out.reports[id]!.kpis.nonfuelPct;
  }
  refreshStandings(room, priv, inputs);
  const shares: Record<string, number> = {};
  for (const id of room.order) shares[id] = Math.round(valueShare(priv.state, priv.state.players[id]!) * 10000) / 10000;
  room.history = [...room.history, { quarter: q, shares, outside: out.outsideShare }];
  room.news = out.news;
  room.revealedAt = now;
  room.deadline = null;
  room.status = q >= room.quarters ? 'finished' : 'results';
  if (room.status === 'finished') room.finishedAt = now;
  room.version++;
}

function refreshStandings(room: MarketRoomDoc, priv: MarketPrivate, inputs?: Record<string, QuarterInput>) {
  const state = priv.state!;
  const vi = valueIndex(state, room.order);
  for (const id of room.order) {
    const row = vi[id]!;
    const sc = scorecardOf(state, id, priv.lastNonfuel[id] ?? 0);
    room.standings[id] = {
      share: Math.round(row.share * 10000) / 10000,
      rating: Math.round(state.players[id]!.rating * 100) / 100,
      profitCum: Math.round(row.profitCum * 100) / 100,
      valueIndex: row.valueIndex,
      rank: row.rank,
      scorecard: sc.total,
      ...(inputs?.[id]?.defaulted ? { defaulted: true } : {}),
    };
  }
}

export interface MarketAdvanceOptions {
  isHost: boolean;
  expectStatus?: MarketRoomDoc['status'];
  expectQuarter?: number;
}

export function advanceMarket(room: MarketRoomDoc, priv: MarketPrivate, now: number, opts: MarketAdvanceOptions): boolean {
  if (opts.expectStatus && opts.expectStatus !== room.status) return false;
  if (opts.expectQuarter !== undefined && opts.expectQuarter !== room.quarter) return false;
  if (room.status === 'decide') {
    const due = room.deadline !== null && now >= room.deadline;
    if (due || humansOf(room).every((id) => priv.decisions[id]) || (opts.isHost && opts.expectStatus === 'decide')) {
      closeQuarter(room, priv, now);
      return true;
    }
    return false;
  }
  if (room.status === 'results' && room.revealedAt !== null) {
    const auto = room.settings.resultsSec > 0 && now >= room.revealedAt + room.settings.resultsSec * 1000;
    if (opts.isHost || auto) {
      openQuarter(room, priv, room.quarter + 1, now);
      return true;
    }
  }
  return false;
}

/** Host: add a minute to the decision timer. */
export function extendMarket(room: MarketRoomDoc, seconds = 60) {
  if (room.status !== 'decide' || room.deadline === null) throw new GameError('not_open', 'Không có đồng hồ để gia hạn.', 409);
  room.deadline += seconds * 1000;
  room.version++;
}

export function finishMarket(room: MarketRoomDoc, priv: MarketPrivate, now: number) {
  if (room.status === 'finished') return;
  if (room.status === 'lobby') throw new GameError('not_started', 'Trận chưa bắt đầu.', 409);
  if (room.status === 'decide') closeQuarter(room, priv, now);
  room.status = 'finished';
  room.finishedAt = room.finishedAt ?? now;
  room.version++;
}

export function marketMe(room: MarketRoomDoc, priv: MarketPrivate, playerId: string): MarketMe {
  const state = priv.state;
  const reports = priv.reports[playerId] ?? [];
  const knownPrefs = state?.players[playerId]?.knownPrefs ?? {};
  const scorecard = state ? scorecardOf(state, playerId, priv.lastNonfuel[playerId] ?? 0) : { nonfuel: 0, repurchase: 0, rating: 0, crisis: 0, total: 0 };
  const st = room.standings[playerId];
  const grade = room.status === 'finished' && st ? gradeOf(scorecard.total, st.rank, room.order.length) : null;
  // Competitor budgets (last quarter) for players who bought enough research this quarter.
  const last = reports[reports.length - 1];
  const intel: string[] = [];
  if (last && last.decision.budget.research >= 0.3 - 1e-9 && state) {
    for (const id of room.order) {
      if (id === playerId) continue;
      const b = state.players[id]?.lastBudget;
      if (!b) continue;
      const top = (Object.entries(b) as [string, number][]).sort((x, y) => y[1] - x[1]).slice(0, 2);
      intel.push(`${room.players[id]?.name}: chi nhiều nhất cho ${top.map(([k, v]) => `${BUDGET_INFO[k as keyof typeof BUDGET_INFO].name} ${v.toFixed(1).replace('.', ',')} tỷ`).join(', ')}`);
    }
  }
  const out: MarketMe = { playerId, reports, pending: room.status === 'decide' ? (priv.decisions[playerId] ?? null) : null, knownPrefs, scorecard, grade };
  if (intel.length && last) last.insights = Array.from(new Set([...last.insights, ...intel.map((s) => `Tình báo thị trường – ${s}`)]));
  return out;
}

/** Grades for Moodle players once the room has finished. */
export function marketLmsResults(room: MarketRoomDoc, priv: MarketPrivate): LmsResult[] {
  if (room.status !== 'finished' || !priv.lti || !priv.state) return [];
  const out: LmsResult[] = [];
  for (const [playerId, binding] of Object.entries(priv.lti)) {
    if (!binding.gradeTarget || !room.players[playerId]) continue;
    const me = marketMe(room, priv, playerId);
    const st = room.standings[playerId];
    if (me.grade === null || !st) continue;
    out.push({
      playerId,
      binding: { ...binding, gradeTarget: binding.gradeTarget },
      score: me.grade,
      comment: `Đấu trường Thị phần · phòng ${room.code} · hạng ${st.rank}/${room.order.length} · giá trị doanh nghiệp ${st.valueIndex} · thẻ mục tiêu ${me.scorecard.total}/100`,
      attemptId: `${room.code}:${playerId}`,
      occurredAt: new Date(room.finishedAt ?? Date.now()).toISOString(),
    });
  }
  return out;
}

export const isMarketBotLevel = (v: unknown): v is BotLevel => v === 'easy' || v === 'medium' || v === 'hard';
