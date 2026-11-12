// Room state machine for Game 3 (pure; the API loads/saves it in a Firestore transaction).
// Rounds 1..3 are months of approach (status 'decide' then 'results'); round 4 is the bid round,
// which closes straight into 'finished' with the contract awards.
import { GameError, type LmsBinding, type LmsResult } from '../room.js';
import { randomToken, seededRng, shuffle, type Rng } from '../rng.js';
import { MAX_SEATS } from '../types.js';
import { gradeOf } from '../market/score.js';
import { ABM_ARCHETYPES, botBids, botPlan, botTargets } from './bots.js';
import { EVENTS, ranked } from './model.js';
import { validateBids, validatePlan } from './rules.js';
import { abmRanking, abmScorecard, initAbm, openMonth, resolveAwards, simulateMonth, specialFor, type AbmState, type MonthInput } from './sim.js';
import {
  BID_ROUND,
  FACTORY_IDS,
  MONTHS,
  ROLES,
  accessOf,
  type AbmArchetype,
  type AbmBid,
  type AbmHiddenFactory,
  type AbmMe,
  type AbmMonthReport,
  type AbmPlan,
  type AbmRoomDoc,
  type AbmSettings,
  type AbmSpecial,
  type FactoryId,
  type RoleId,
} from './types.js';

export interface AbmPrivate {
  hostToken: string;
  tokens: Record<string, string>;
  lti?: Record<string, LmsBinding>;
  state: AbmState | null;
  archetypes: Record<string, AbmArchetype>;
  targets: Record<string, FactoryId[]>;
  /** This month's plans (humans), editable until the month closes. */
  plans: Record<string, AbmPlan>;
  bids: Record<string, AbmBid[]>;
  reports: Record<string, AbmMonthReport[]>;
  specials: Record<string, AbmSpecial | null>;
}

export const DEFAULT_ABM_SETTINGS: AbmSettings = { monthSec: 300, briefSec: 180, bidSec: 240, resultsSec: 0, botLevel: 'medium', fillBots: true };

export function normalizeAbmSettings(s: Partial<AbmSettings> | undefined): AbmSettings {
  const int = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  const solo = s?.monthSec === 0;
  return {
    monthSec: solo ? 0 : int(s?.monthSec, 60, 900, DEFAULT_ABM_SETTINGS.monthSec),
    briefSec: solo ? 0 : int(s?.briefSec ?? DEFAULT_ABM_SETTINGS.briefSec, 0, 600, DEFAULT_ABM_SETTINGS.briefSec),
    bidSec: solo || s?.bidSec === 0 ? 0 : int(s?.bidSec, 60, 900, DEFAULT_ABM_SETTINGS.bidSec),
    resultsSec: int(s?.resultsSec ?? 0, 0, 300, 0),
    botLevel: s?.botLevel && ['easy', 'medium', 'hard'].includes(s.botLevel) ? s.botLevel : 'medium',
    fillBots: s?.fillBots ?? true,
  };
}

const BOT_NAMES = ['Hưng Thịnh Polymer', 'Đại Dương Plastics', 'Tân Phát PP', 'Minh Long Resin', 'Bình An Nhựa', 'Phương Nam Hạt'];

export function createAbmRoom(
  input: { code: string; title?: string; hostPlays: boolean; hostName?: string; settings?: Partial<AbmSettings>; hostLms?: LmsBinding },
  now: number,
  rng: Rng,
) {
  const room: AbmRoomDoc = {
    code: input.code,
    game: 'key-accounts',
    title: (input.title ?? '').trim().slice(0, 40) || `Phòng ${input.code}`,
    status: 'lobby',
    createdAt: now,
    hostPlays: input.hostPlays,
    hostPlayerId: null,
    settings: normalizeAbmSettings(input.settings),
    players: {},
    order: [],
    round: 0,
    rounds: BID_ROUND,
    openedAt: null,
    deadline: null,
    event: null,
    submitted: {},
    heat: {},
    news: [],
    standings: {},
    awards: null,
    hidden: null,
    revealedAt: null,
    startedAt: null,
    finishedAt: null,
    version: 1,
  };
  const priv: AbmPrivate = { hostToken: randomToken(rng), tokens: {}, state: null, archetypes: {}, targets: {}, plans: {}, bids: {}, reports: {}, specials: {} };
  let player: { playerId: string; playerToken: string } | null = null;
  if (input.hostPlays) {
    player = joinAbm(room, priv, input.hostName ?? '', now, rng, input.hostLms);
    room.hostPlayerId = player.playerId;
  }
  return { room, priv, hostToken: priv.hostToken, player };
}

function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!name) throw new GameError('bad_name', 'Vui lòng nhập tên.');
  return name;
}

export function joinAbm(room: AbmRoomDoc, priv: AbmPrivate, rawName: string, now: number, rng: Rng, lms?: LmsBinding) {
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

export function removeAbmPlayer(room: AbmRoomDoc, priv: AbmPrivate, playerId: string) {
  if (room.status !== 'lobby') throw new GameError('started', 'Chỉ xóa được người chơi khi chưa bắt đầu.', 409);
  if (!room.players[playerId]) throw new GameError('no_player', 'Không có người chơi này.', 404);
  if (playerId === room.hostPlayerId) throw new GameError('host', 'Không thể xóa chủ phòng.', 409);
  delete room.players[playerId];
  delete priv.tokens[playerId];
  if (priv.lti) delete priv.lti[playerId];
  room.order = room.order.filter((id) => id !== playerId);
  room.version++;
}

const humansOf = (room: AbmRoomDoc) => room.order.filter((id) => !room.players[id]?.bot);
const isBid = (room: AbmRoomDoc) => room.round === BID_ROUND;

export function startAbm(room: AbmRoomDoc, priv: AbmPrivate, now: number, rng: Rng) {
  if (room.status !== 'lobby') throw new GameError('started', 'Trận đã bắt đầu.', 409);
  if (humansOf(room).length === 0) throw new GameError('empty', 'Phòng chưa có người chơi.', 409);
  const seed = seededRng(`${room.code}:${now}:abm`);
  if (room.settings.fillBots) {
    const kinds = shuffle(rng, ABM_ARCHETYPES);
    let i = 0;
    while (room.order.length < MAX_SEATS) {
      const id = `b${i + 1}`;
      const archetype = kinds[i % kinds.length]!;
      room.players[id] = { id, name: `${BOT_NAMES[i % BOT_NAMES.length]} (máy)`, bot: true, level: room.settings.botLevel, archetype, joinedAt: now };
      priv.archetypes[id] = archetype;
      priv.targets[id] = botTargets(archetype, room.settings.botLevel, seed);
      room.order.push(id);
      i++;
    }
  }
  priv.state = initAbm(room.order, seed);
  room.startedAt = now;
  for (const id of room.order) priv.reports[id] = [];
  refreshStandings(room, priv);
  openRound(room, priv, 1, now);
}

function openRound(room: AbmRoomDoc, priv: AbmPrivate, round: number, now: number) {
  const state = priv.state!;
  room.status = 'decide';
  room.round = round;
  room.openedAt = now;
  room.submitted = {};
  room.revealedAt = null;
  priv.plans = {};
  priv.specials = {};
  if (round <= MONTHS) {
    openMonth(state, round);
    const ev = EVENTS[round];
    room.event = ev ? { round, title: ev.title, text: ev.text } : null;
    if (round === MONTHS) for (const id of room.order) priv.specials[id] = specialFor(state, room.order, id);
    const sec = room.settings.monthSec > 0 ? room.settings.monthSec + (round === 1 ? room.settings.briefSec : 0) : 0;
    room.deadline = sec > 0 ? now + sec * 1000 : null;
  } else {
    room.event = { round, title: 'Nộp hồ sơ chào hàng', text: 'Chọn tối đa 4 nhà máy. Mỗi hồ sơ: mức giá so với hàng nhập khẩu và 3 thẻ lợi ích.' };
    priv.bids = {};
    room.deadline = room.settings.bidSec > 0 ? now + room.settings.bidSec * 1000 : null;
  }
  room.version++;
}

export function submitAbmPlan(room: AbmRoomDoc, priv: AbmPrivate, playerId: string, round: number, raw: AbmPlan, now: number): boolean {
  checkOpen(room, playerId, round, now);
  if (isBid(room)) throw new GameError('bad_input', 'Đang ở vòng nộp hồ sơ.', 409);
  priv.plans[playerId] = validatePlan(raw, priv.state!.players[playerId]!.rel, priv.specials[playerId] ?? null);
  return markSubmitted(room, priv, playerId, now);
}

export function submitAbmBids(room: AbmRoomDoc, priv: AbmPrivate, playerId: string, round: number, raw: AbmBid[], now: number): boolean {
  checkOpen(room, playerId, round, now);
  if (!isBid(room)) throw new GameError('bad_input', 'Chưa đến vòng nộp hồ sơ.', 409);
  priv.bids[playerId] = validateBids(raw);
  return markSubmitted(room, priv, playerId, now);
}

function checkOpen(room: AbmRoomDoc, playerId: string, round: number, now: number) {
  if (room.status !== 'decide') throw new GameError('not_open', 'Vòng này đã đóng.', 409);
  if (round !== room.round) throw new GameError('stale', 'Đã sang vòng khác.', 409);
  const p = room.players[playerId];
  if (!p || p.bot) throw new GameError('no_player', 'Không có người chơi này.', 404);
  if (room.deadline !== null && now > room.deadline + 2000) throw new GameError('late', 'Hết giờ.', 409);
}

function markSubmitted(room: AbmRoomDoc, priv: AbmPrivate, playerId: string, now: number): boolean {
  room.submitted[playerId] = true;
  room.version++;
  const all = humansOf(room).every((id) => (isBid(room) ? priv.bids[id] : priv.plans[id]));
  if (all) {
    closeRound(room, priv, now);
    return true;
  }
  return false;
}

export function closeRound(room: AbmRoomDoc, priv: AbmPrivate, now: number) {
  if (room.status !== 'decide' || !priv.state) throw new GameError('not_open', 'Vòng này đã đóng.', 409);
  const state = priv.state;
  const rng = seededRng(`${room.code}:${room.startedAt}:abm:${room.round}`);
  if (!isBid(room)) {
    const inputs: Record<string, MonthInput> = {};
    for (const id of room.order) {
      const p = room.players[id]!;
      if (p.bot) inputs[id] = { plan: botPlan(priv.archetypes[id] ?? 'abm', p.level ?? 'medium', priv.targets[id] ?? [], state, id, room.round, priv.specials[id] ?? null, rng), defaulted: false };
      else if (priv.plans[id]) inputs[id] = { plan: priv.plans[id]!, defaulted: false };
      else inputs[id] = { plan: { actions: [] }, defaulted: true };
    }
    const out = simulateMonth(state, room.order, inputs, priv.specials, room.round, rng);
    for (const id of room.order) priv.reports[id] = [...(priv.reports[id] ?? []), out.reports[id]!];
    room.heat = out.heat;
    room.news = out.news;
    refreshStandings(room, priv, inputs);
    room.status = 'results';
  } else {
    for (const id of room.order) {
      const p = room.players[id]!;
      if (p.bot) priv.bids[id] = botBids(priv.archetypes[id] ?? 'abm', p.level ?? 'medium', priv.targets[id] ?? [], state, id, rng);
      else priv.bids[id] = priv.bids[id] ?? [];
    }
    room.awards = resolveAwards(state, room.order, priv.bids);
    room.news = [];
    refreshStandings(room, priv);
    for (const id of humansOf(room)) if (!room.submitted[id]) room.standings[id] = { ...room.standings[id]!, defaulted: true };
    room.status = 'finished';
    room.finishedAt = now;
  }
  room.revealedAt = now;
  room.deadline = null;
  room.version++;
}

function refreshStandings(room: AbmRoomDoc, priv: AbmPrivate, inputs?: Record<string, MonthInput>) {
  const state = priv.state!;
  const done = room.awards !== null;
  const rows = abmRanking(state, room.order, done ? priv.bids : null, room.awards);
  for (const id of room.order) {
    const r = rows[id]!;
    room.standings[id] = {
      cost: r.cost,
      gp: r.gp,
      net: r.net,
      contracts: r.contracts,
      bids: r.bids,
      rank: r.rank,
      scorecard: r.scorecard,
      ...(inputs?.[id]?.defaulted ? { defaulted: true } : {}),
    };
  }
}

export interface AbmAdvanceOptions {
  isHost: boolean;
  expectStatus?: AbmRoomDoc['status'];
  expectRound?: number;
}

export function advanceAbm(room: AbmRoomDoc, priv: AbmPrivate, now: number, opts: AbmAdvanceOptions): boolean {
  if (opts.expectStatus && opts.expectStatus !== room.status) return false;
  if (opts.expectRound !== undefined && opts.expectRound !== room.round) return false;
  if (room.status === 'decide') {
    const due = room.deadline !== null && now >= room.deadline;
    const all = humansOf(room).every((id) => (isBid(room) ? priv.bids[id] : priv.plans[id]));
    if (due || all || (opts.isHost && opts.expectStatus === 'decide')) {
      closeRound(room, priv, now);
      return true;
    }
    return false;
  }
  if (room.status === 'results' && room.revealedAt !== null) {
    const auto = room.settings.resultsSec > 0 && now >= room.revealedAt + room.settings.resultsSec * 1000;
    if (opts.isHost || auto) {
      openRound(room, priv, room.round + 1, now);
      return true;
    }
  }
  return false;
}

export function extendAbm(room: AbmRoomDoc, seconds = 60) {
  if (room.status !== 'decide' || room.deadline === null) throw new GameError('not_open', 'Không có đồng hồ để gia hạn.', 409);
  room.deadline += seconds * 1000;
  room.version++;
}

/** Host "Kết thúc": closes what is open; months not yet played are skipped and the bids are taken as they are. */
export function finishAbm(room: AbmRoomDoc, priv: AbmPrivate, now: number) {
  if (room.status === 'finished') return;
  if (room.status === 'lobby') throw new GameError('not_started', 'Trận chưa bắt đầu.', 409);
  if (room.status === 'decide' && !isBid(room)) closeRound(room, priv, now);
  if (room.status === 'results') openRound(room, priv, BID_ROUND, now);
  if (room.status === 'decide') closeRound(room, priv, now);
}

/** Facilitator: show the hidden committees to everyone for the debrief (only once the room has finished). */
export function revealAbmHidden(room: AbmRoomDoc, priv: AbmPrivate) {
  if (room.status !== 'finished' || !priv.state) throw new GameError('not_finished', 'Chỉ lật phần ẩn sau khi trao hợp đồng.', 409);
  const out: Partial<Record<FactoryId, AbmHiddenFactory>> = {};
  for (const f of FACTORY_IDS) {
    const h = priv.state.hidden[f];
    const top = {} as Record<RoleId, AbmHiddenFactory['top'][RoleId]>;
    for (const r of ROLES) top[r] = ranked(h.pains[r]).slice(0, 2);
    out[f] = { influence: { ...h.influence }, top, threshold: Math.round(h.threshold * 100) };
  }
  room.hidden = out;
  room.version++;
}

export function abmMe(room: AbmRoomDoc, priv: AbmPrivate, playerId: string): AbmMe {
  const state = priv.state;
  const p = state?.players[playerId];
  const rel = (p?.rel ?? {}) as AbmMe['rel'];
  const access = {} as AbmMe['access'];
  if (p) for (const f of FACTORY_IDS) access[f] = accessOf(f, p.rel[f]);
  const done = room.status === 'finished' && room.awards !== null;
  const wins = done ? room.awards!.filter((a) => a.winner === playerId).length : null;
  const myBids = isBid(room) || done ? (priv.bids[playerId] ?? null) : null;
  const scorecard = p ? abmScorecard(p, done ? (priv.bids[playerId] ?? []) : null, wins) : { reach: 0, contracts: 0, noDiscount: 0, winRate: 0, total: 0, reachedFactories: 0 };
  const st = room.standings[playerId];
  const grade = done && st ? gradeOf(scorecard.total, st.rank, room.order.length) : null;
  return {
    playerId,
    rel,
    access,
    known: p?.known ?? {},
    reports: priv.reports[playerId] ?? [],
    pending: room.status === 'decide' && !isBid(room) ? (priv.plans[playerId] ?? null) : null,
    bids: myBids,
    special: room.status === 'decide' ? (priv.specials[playerId] ?? null) : null,
    priceCap: p?.priceCap ?? {},
    costCum: p?.cost ?? 0,
    scorecard,
    grade,
  };
}

export function abmLmsResults(room: AbmRoomDoc, priv: AbmPrivate): LmsResult[] {
  if (room.status !== 'finished' || !priv.lti || !priv.state) return [];
  const out: LmsResult[] = [];
  for (const [playerId, binding] of Object.entries(priv.lti)) {
    if (!binding.gradeTarget || !room.players[playerId]) continue;
    const me = abmMe(room, priv, playerId);
    const st = room.standings[playerId];
    if (me.grade === null || !st) continue;
    out.push({
      playerId,
      binding: { ...binding, gradeTarget: binding.gradeTarget },
      score: me.grade,
      comment: `Săn hợp đồng trọng điểm · phòng ${room.code} · hạng ${st.rank}/${room.order.length} · ${st.contracts} hợp đồng · lãi ròng ${st.net.toFixed(2)} tỷ · thẻ mục tiêu ${me.scorecard.total}/100`,
      attemptId: `${room.code}:${playerId}`,
      occurredAt: new Date(room.finishedAt ?? Date.now()).toISOString(),
    });
  }
  return out;
}
