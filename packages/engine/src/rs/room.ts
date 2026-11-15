// Khung round-sim: một máy trạng thái phòng dùng chung cho mọi game nhiều vòng.
// Mỗi game cắm mô hình ẩn của mình vào qua RsGame; API nạp/ghi phòng + trạng thái riêng trong một transaction.
import { gradeOf } from '../market/score.js';
import { GameError, cleanName, type LmsBinding, type LmsResult } from '../room.js';
import { randomToken, seededRng, shuffle, type Rng } from '../rng.js';
import { MAX_SEATS, type BotLevel } from '../types.js';
import type { RsGameId, RsMe, RsRoomDoc, RsScorecard, RsSettings } from './types.js';

export interface RsInput<D> {
  decision: D;
  defaulted: boolean;
}

export interface RsRoundOut<R> {
  reports: Record<string, R>;
  news: string[];
  /** Số liệu tiêu biểu của mỗi đơn vị, dùng cho biểu đồ. */
  values: Record<string, number>;
  pub?: Record<string, unknown>;
}

export interface RsGame<D = any, S = any, R = any, V = any> {
  id: RsGameId;
  rounds: number;
  /** Nhãn ngắn dùng trong ghi chú gửi về Moodle. */
  label: string;
  botNames: string[];
  archetypes: string[];
  defaultSettings: RsSettings;
  init(order: string[], room: RsRoomDoc, rng: Rng): S;
  /** Ném GameError nếu dữ liệu sai; trả về quyết định đã làm sạch. */
  validate(raw: unknown, round: number, state: S, playerId: string): D;
  /** Dùng khi học viên không nộp kịp. */
  fallback(state: S, playerId: string, round: number, last: D | undefined): D;
  bot(archetype: string, level: BotLevel, state: S, playerId: string, round: number, rng: Rng): D;
  simulate(state: S, order: string[], inputs: Record<string, RsInput<D>>, round: number, rng: Rng): RsRoundOut<R>;
  /** Thẻ mục tiêu 0–100 tới lúc này, tuyệt đối (không so với đối thủ). */
  scorecard(state: S, playerId: string, finished: boolean): RsScorecard;
  /** Các cột của bảng xếp hạng. */
  cols(state: S, playerId: string, finished: boolean): Record<string, number>;
  flag?(state: S, playerId: string): string | undefined;
  view(state: S, playerId: string, round: number, finished: boolean): V;
  badges?(state: S, playerId: string, order: string[]): string[];
  /** Dữ liệu thị trường công khai sau mỗi vòng (và lúc bắt đầu). */
  pub?(state: S, order: string[], round: number): Record<string, unknown>;
}

export interface RsPrivate {
  hostToken: string;
  tokens: Record<string, string>;
  lti?: Record<string, LmsBinding>;
  state: unknown;
  archetypes: Record<string, string>;
  decisions: Record<string, unknown>;
  lastDecisions: Record<string, unknown>;
  reports: Record<string, unknown[]>;
}

export function normalizeRsSettings(def: RsGame, s: Partial<RsSettings> | undefined): RsSettings {
  const int = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  return {
    decideSec: s?.decideSec === 0 ? 0 : int(s?.decideSec, 60, 900, def.defaultSettings.decideSec),
    resultsSec: int(s?.resultsSec ?? 0, 0, 300, 0),
    botLevel: s?.botLevel && ['easy', 'medium', 'hard'].includes(s.botLevel) ? s.botLevel : def.defaultSettings.botLevel,
    fillBots: s?.fillBots ?? true,
  };
}

export function createRsRoom(
  def: RsGame,
  input: { code: string; title?: string; hostPlays: boolean; hostName?: string; settings?: Partial<RsSettings>; hostLms?: LmsBinding },
  now: number,
  rng: Rng,
) {
  const room: RsRoomDoc = {
    code: input.code,
    game: def.id,
    title: (input.title ?? '').trim().slice(0, 40) || `Phòng ${input.code}`,
    status: 'lobby',
    createdAt: now,
    hostPlays: input.hostPlays,
    hostPlayerId: null,
    settings: normalizeRsSettings(def, input.settings),
    players: {},
    order: [],
    round: 0,
    rounds: def.rounds,
    openedAt: null,
    deadline: null,
    submitted: {},
    standings: {},
    history: [],
    news: [],
    pub: {},
    revealedAt: null,
    startedAt: null,
    finishedAt: null,
    version: 1,
  };
  const priv: RsPrivate = { hostToken: randomToken(rng), tokens: {}, state: null, archetypes: {}, decisions: {}, lastDecisions: {}, reports: {} };
  let player: { playerId: string; playerToken: string } | null = null;
  if (input.hostPlays) {
    player = joinRs(room, priv, input.hostName ?? '', now, rng, input.hostLms);
    room.hostPlayerId = player.playerId;
  }
  return { room, priv, hostToken: priv.hostToken, player };
}

export function joinRs(room: RsRoomDoc, priv: RsPrivate, rawName: string, now: number, rng: Rng, lms?: LmsBinding) {
  // Mở lại hoạt động trong Moodle thì về đúng ghế cũ, không chiếm ghế mới.
  if (lms) {
    const seat = Object.entries(priv.lti ?? {}).find(([, b]) => b.hubUserId === lms.hubUserId)?.[0];
    if (seat && room.players[seat] && priv.tokens[seat]) return { playerId: seat, playerToken: priv.tokens[seat]! };
  }
  if (room.status !== 'lobby') throw new GameError('started', 'Trận đã bắt đầu, không vào thêm được.', 409);
  if (room.order.length >= MAX_SEATS) throw new GameError('full', 'Phòng đã đủ 6 đơn vị.', 409);
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

export function removeRsPlayer(room: RsRoomDoc, priv: RsPrivate, playerId: string) {
  if (room.status !== 'lobby') throw new GameError('started', 'Chỉ xóa được người chơi khi chưa bắt đầu.', 409);
  if (!room.players[playerId]) throw new GameError('no_player', 'Không có người chơi này.', 404);
  if (playerId === room.hostPlayerId) throw new GameError('host', 'Không thể xóa chủ phòng.', 409);
  delete room.players[playerId];
  delete priv.tokens[playerId];
  if (priv.lti) delete priv.lti[playerId];
  room.order = room.order.filter((id) => id !== playerId);
  room.version++;
}

const humansOf = (room: RsRoomDoc) => room.order.filter((id) => !room.players[id]?.bot);

export function startRs(def: RsGame, room: RsRoomDoc, priv: RsPrivate, now: number, rng: Rng) {
  if (room.status !== 'lobby') throw new GameError('started', 'Trận đã bắt đầu.', 409);
  if (humansOf(room).length === 0) throw new GameError('empty', 'Phòng chưa có người chơi.', 409);
  if (room.settings.fillBots) {
    // Tên máy gán theo ghế, lối chơi xáo trộn: tên không được hé ra chiến lược.
    const kinds = shuffle(rng, def.archetypes);
    let i = 0;
    while (room.order.length < MAX_SEATS) {
      const id = `b${i + 1}`;
      const archetype = kinds[i % kinds.length]!;
      room.players[id] = { id, name: `${def.botNames[i % def.botNames.length]} (máy)`, bot: true, level: room.settings.botLevel, archetype, joinedAt: now };
      priv.archetypes[id] = archetype;
      room.order.push(id);
      i++;
    }
  }
  room.startedAt = now;
  priv.state = def.init(room.order, room, seededRng(`${room.code}:${now}:init`));
  for (const id of room.order) priv.reports[id] = [];
  refreshStandings(def, room, priv);
  room.pub = def.pub?.(priv.state, room.order, 0) ?? {};
  openRound(room, priv, 1, now);
}

function openRound(room: RsRoomDoc, priv: RsPrivate, round: number, now: number) {
  room.status = 'decide';
  room.round = round;
  room.openedAt = now;
  room.deadline = room.settings.decideSec > 0 ? now + room.settings.decideSec * 1000 : null;
  room.submitted = {};
  room.revealedAt = null;
  priv.decisions = {};
  room.version++;
}

export function submitRs(def: RsGame, room: RsRoomDoc, priv: RsPrivate, playerId: string, round: number, raw: unknown, now: number): boolean {
  if (room.status !== 'decide') throw new GameError('not_open', 'Vòng này đã đóng.', 409);
  if (round !== room.round) throw new GameError('stale', 'Đã sang vòng khác.', 409);
  const p = room.players[playerId];
  if (!p || p.bot) throw new GameError('no_player', 'Không có người chơi này.', 404);
  if (room.deadline !== null && now > room.deadline + 2000) throw new GameError('late', 'Hết giờ.', 409);
  priv.decisions[playerId] = def.validate(raw, room.round, priv.state, playerId);
  room.submitted[playerId] = true;
  room.version++;
  if (humansOf(room).every((id) => priv.decisions[id])) {
    closeRsRound(def, room, priv, now);
    return true;
  }
  return false;
}

export function closeRsRound(def: RsGame, room: RsRoomDoc, priv: RsPrivate, now: number) {
  if (room.status !== 'decide' || !priv.state) throw new GameError('not_open', 'Vòng này đã đóng.', 409);
  const r = room.round;
  const rng = seededRng(`${room.code}:${room.startedAt}:${def.id}:${r}`);
  const inputs: Record<string, RsInput<unknown>> = {};
  for (const id of room.order) {
    const p = room.players[id]!;
    if (p.bot) inputs[id] = { decision: def.bot(priv.archetypes[id] ?? def.archetypes[0]!, p.level ?? 'medium', priv.state, id, r, rng), defaulted: false };
    else if (priv.decisions[id] !== undefined) inputs[id] = { decision: priv.decisions[id], defaulted: false };
    else inputs[id] = { decision: def.fallback(priv.state, id, r, priv.lastDecisions[id]), defaulted: true };
  }
  const out = def.simulate(priv.state, room.order, inputs, r, rng);
  for (const id of room.order) {
    priv.reports[id] = [...(priv.reports[id] ?? []), out.reports[id]];
    priv.lastDecisions[id] = inputs[id]!.decision;
  }
  room.history = [...room.history, { round: r, values: out.values }];
  room.news = out.news;
  room.pub = out.pub ?? def.pub?.(priv.state, room.order, r) ?? room.pub;
  room.status = r >= room.rounds ? 'finished' : 'results';
  if (room.status === 'finished') room.finishedAt = now;
  refreshStandings(def, room, priv, inputs);
  room.revealedAt = now;
  room.deadline = null;
  room.version++;
}

function refreshStandings(def: RsGame, room: RsRoomDoc, priv: RsPrivate, inputs?: Record<string, RsInput<unknown>>) {
  const done = room.status === 'finished';
  const scores = Object.fromEntries(room.order.map((id) => [id, def.scorecard(priv.state, id, done).total]));
  const sorted = room.order.slice().sort((a, b) => scores[b]! - scores[a]! || room.order.indexOf(a) - room.order.indexOf(b));
  room.standings = {};
  sorted.forEach((id, i) => {
    const flag = def.flag?.(priv.state, id);
    room.standings[id] = {
      score: Math.round(scores[id]! * 10) / 10,
      rank: i + 1,
      cols: def.cols(priv.state, id, done),
      ...(inputs?.[id]?.defaulted ? { defaulted: true } : {}),
      ...(flag ? { flag } : {}),
    };
  });
}

export interface RsAdvanceOptions {
  isHost: boolean;
  expectStatus?: RsRoomDoc['status'];
  expectRound?: number;
}

export function advanceRs(def: RsGame, room: RsRoomDoc, priv: RsPrivate, now: number, opts: RsAdvanceOptions): boolean {
  if (opts.expectStatus && opts.expectStatus !== room.status) return false;
  if (opts.expectRound !== undefined && opts.expectRound !== room.round) return false;
  if (room.status === 'decide') {
    const due = room.deadline !== null && now >= room.deadline;
    if (due || humansOf(room).every((id) => priv.decisions[id] !== undefined) || (opts.isHost && opts.expectStatus === 'decide')) {
      closeRsRound(def, room, priv, now);
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

export function extendRs(room: RsRoomDoc, seconds = 60) {
  if (room.status !== 'decide' || room.deadline === null) throw new GameError('not_open', 'Không có đồng hồ để gia hạn.', 409);
  room.deadline += seconds * 1000;
  room.version++;
}

/** Chủ phòng bấm "Kết thúc": các vòng chưa chơi được chơi bằng lựa chọn gần nhất của mỗi đơn vị. */
export function finishRs(def: RsGame, room: RsRoomDoc, priv: RsPrivate, now: number) {
  if (room.status === 'finished') return;
  if (room.status === 'lobby') throw new GameError('not_started', 'Trận chưa bắt đầu.', 409);
  for (let guard = 0; guard < room.rounds * 3 && (room.status as string) !== 'finished'; guard++) {
    if (room.status === 'decide') closeRsRound(def, room, priv, now);
    else if (room.status === 'results') openRound(room, priv, room.round + 1, now);
  }
}

export function rsMe(def: RsGame, room: RsRoomDoc, priv: RsPrivate, playerId: string): RsMe {
  const done = room.status === 'finished';
  const has = !!priv.state && room.order.includes(playerId);
  const sc = has ? def.scorecard(priv.state, playerId, done) : { total: 0, parts: {} };
  const st = room.standings[playerId];
  return {
    playerId,
    reports: priv.reports[playerId] ?? [],
    pending: room.status === 'decide' ? (priv.decisions[playerId] ?? null) : null,
    scorecard: { total: Math.round(sc.total * 10) / 10, parts: sc.parts },
    grade: done && st ? gradeOf(sc.total, st.rank, room.order.length) : null,
    view: has ? def.view(priv.state, playerId, room.round, done) : null,
    badges: done && has ? (def.badges?.(priv.state, playerId, room.order) ?? []) : [],
  };
}

export function rsLmsResults(def: RsGame, room: RsRoomDoc, priv: RsPrivate): LmsResult[] {
  if (room.status !== 'finished' || !priv.lti || !priv.state) return [];
  const out: LmsResult[] = [];
  for (const [playerId, binding] of Object.entries(priv.lti)) {
    if (!binding.gradeTarget || !room.players[playerId]) continue;
    const me = rsMe(def, room, priv, playerId);
    const st = room.standings[playerId];
    if (me.grade === null || !st) continue;
    out.push({
      playerId,
      binding: { ...binding, gradeTarget: binding.gradeTarget },
      score: me.grade,
      comment: `${def.label} · phòng ${room.code} · hạng ${st.rank}/${room.order.length} · thẻ mục tiêu ${me.scorecard.total}/100`,
      attemptId: `${room.code}:${playerId}`,
      occurredAt: new Date(room.finishedAt ?? Date.now()).toISOString(),
    });
  }
  return out;
}
