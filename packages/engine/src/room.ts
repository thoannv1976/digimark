// Pure room state machine. The API loads RoomDoc + RoomPrivate in a Firestore transaction,
// calls one of these functions (which mutate the objects in place) and writes both back.
import { timeLimitOf, type BankQuestion } from './bank.js';
import { BOT_NAMES, botDisplayName, planBotAnswer, type BotPlan } from './bots.js';
import { buildHint, isValidInput, preparePublic, selectQuestions } from './questions.js';
import { randomToken, seededRng, type Rng } from './rng.js';
import { computePoints, gradeFraction } from './scoring.js';
import {
  CATEGORIES,
  HINTS_PER_GAME,
  MAX_SEATS,
  type AnswerInput,
  type AnswerKey,
  type Category,
  type HintPayload,
  type PlayerPublic,
  type PlayerResult,
  type RoomDoc,
  type RoomSettings,
} from './types.js';

export interface StoredAnswer {
  input: AnswerInput;
  at: number;
  hint: boolean;
}

/** Server-only half of a room (Firestore: rooms/{code}/private/state). */
export interface RoomPrivate {
  hostToken: string;
  tokens: Record<string, string>;
  questionIds: string[];
  key: AnswerKey | null;
  answers: Record<string, StoredAnswer>;
  botPlans: Record<string, BotPlan>;
  hints: Record<string, HintPayload>;
  /** Players who came from Moodle (via UniGame Hub): where their grade goes. */
  lti?: Record<string, LmsBinding>;
}

export interface LmsBinding {
  hubUserId: string;
  /** Absent when the Moodle activity has no gradebook column. */
  gradeTarget?: string;
}

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Players see the question this long before answers count (time to read the prompt). */
export const OPEN_DELAY_MS = 1500;
/** Network grace after the deadline. */
export const ANSWER_GRACE_MS = 1500;
export const NAME_MAX = 24;

export const DEFAULT_SETTINGS: RoomSettings = {
  questionCount: 15,
  botLevel: 'medium',
  fillBots: true,
  categories: CATEGORIES.slice(),
  autoNextSec: 0,
};

export function normalizeSettings(s: Partial<RoomSettings> | undefined): RoomSettings {
  const cats = (s?.categories ?? DEFAULT_SETTINGS.categories).filter((c): c is Category => CATEGORIES.includes(c));
  return {
    questionCount: clampInt(s?.questionCount ?? DEFAULT_SETTINGS.questionCount, 5, 30),
    botLevel: s?.botLevel && ['easy', 'medium', 'hard'].includes(s.botLevel) ? s.botLevel : DEFAULT_SETTINGS.botLevel,
    fillBots: s?.fillBots ?? DEFAULT_SETTINGS.fillBots,
    categories: cats.length ? Array.from(new Set(cats)) : CATEGORIES.slice(),
    autoNextSec: clampInt(s?.autoNextSec ?? DEFAULT_SETTINGS.autoNextSec, 0, 60),
  };
}

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.round(Number.isFinite(v) ? v : lo);
  return Math.min(hi, Math.max(lo, n));
}

export function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  if (!name) throw new GameError('bad_name', 'Vui lòng nhập tên.');
  return name;
}

function uniqueName(room: RoomDoc, name: string): string {
  const taken = new Set(Object.values(room.players).map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name.slice(0, NAME_MAX - 4)} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function newPlayer(id: string, name: string, now: number, bot?: RoomSettings['botLevel']): PlayerPublic {
  return {
    id,
    name,
    bot: Boolean(bot),
    ...(bot ? { level: bot } : {}),
    score: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    hintsLeft: bot ? 0 : HINTS_PER_GAME,
    joinedAt: now,
    stats: {},
  };
}

export interface CreateRoomInput {
  code: string;
  title?: string;
  hostPlays: boolean;
  hostName?: string;
  settings?: Partial<RoomSettings>;
  hostLms?: LmsBinding;
}

export function createRoom(input: CreateRoomInput, now: number, rng: Rng) {
  const room: RoomDoc = {
    code: input.code,
    game: 'ai-detective',
    title: (input.title ?? '').trim().slice(0, 40) || `Phòng ${input.code}`,
    status: 'lobby',
    createdAt: now,
    hostPlays: input.hostPlays,
    hostPlayerId: null,
    settings: normalizeSettings(input.settings),
    players: {},
    order: [],
    qIndex: -1,
    qTotal: 0,
    current: null,
    answered: {},
    reveal: null,
    startedAt: null,
    finishedAt: null,
    version: 1,
  };
  const priv: RoomPrivate = { hostToken: randomToken(rng), tokens: {}, questionIds: [], key: null, answers: {}, botPlans: {}, hints: {} };
  let player: { playerId: string; playerToken: string } | null = null;
  if (input.hostPlays) {
    player = joinRoom(room, priv, input.hostName ?? '', now, rng, input.hostLms);
    room.hostPlayerId = player.playerId;
  }
  return { room, priv, hostToken: priv.hostToken, player };
}

export function joinRoom(room: RoomDoc, priv: RoomPrivate, rawName: string, now: number, rng: Rng, lms?: LmsBinding) {
  if (lms) {
    // Same Moodle user again (other tab/device): give back the same seat.
    const seat = Object.entries(priv.lti ?? {}).find(([, b]) => b.hubUserId === lms.hubUserId)?.[0];
    if (seat && room.players[seat] && priv.tokens[seat]) return { playerId: seat, playerToken: priv.tokens[seat] as string };
  }
  if (room.status === 'finished') throw new GameError('finished', 'Phòng đã kết thúc.', 409);
  if (room.order.length >= MAX_SEATS) throw new GameError('full', 'Phòng đã đủ 6 người.', 409);
  const name = uniqueName(room, cleanName(rawName));
  const playerId = `p${room.order.length + 1}_${randomToken(rng, 6)}`;
  room.players[playerId] = newPlayer(playerId, name, now);
  if (lms) {
    priv.lti = { ...(priv.lti ?? {}), [playerId]: lms };
    if (lms.gradeTarget) room.players[playerId]!.lms = true;
  }
  room.order.push(playerId);
  const playerToken = randomToken(rng);
  priv.tokens[playerId] = playerToken;
  room.version++;
  return { playerId, playerToken };
}

export function removePlayer(room: RoomDoc, priv: RoomPrivate, playerId: string) {
  if (room.status !== 'lobby') throw new GameError('started', 'Chỉ xóa được người chơi khi chưa bắt đầu.', 409);
  if (!room.players[playerId]) throw new GameError('no_player', 'Không có người chơi này.', 404);
  if (playerId === room.hostPlayerId) throw new GameError('host', 'Không thể xóa chủ phòng.', 409);
  delete room.players[playerId];
  delete priv.tokens[playerId];
  if (priv.lti) delete priv.lti[playerId];
  room.order = room.order.filter((id) => id !== playerId);
  room.version++;
}

const humans = (room: RoomDoc) => room.order.filter((id) => !room.players[id]?.bot);

export function startGame(room: RoomDoc, priv: RoomPrivate, bank: readonly BankQuestion[], now: number, rng: Rng) {
  if (room.status !== 'lobby') throw new GameError('started', 'Trò chơi đã bắt đầu.', 409);
  if (humans(room).length === 0) throw new GameError('empty', 'Phòng chưa có người chơi.', 409);
  if (room.settings.fillBots) {
    // Skip bot names that look like a human's name ("Lan" vs "Lan (máy)").
    const humanNames = Object.values(room.players).map((p) => p.name.toLowerCase());
    const clashes = (n: string) => humanNames.some((h) => h === n.toLowerCase() || h.startsWith(`${n.toLowerCase()} `));
    const names = BOT_NAMES.filter((n) => !clashes(n));
    let b = 0;
    while (room.order.length < MAX_SEATS) {
      const id = `b${b + 1}`;
      const base = names[b] ? `${names[b]} (máy)` : botDisplayName(b);
      room.players[id] = newPlayer(id, uniqueName(room, base), now, room.settings.botLevel);
      room.order.push(id);
      b++;
    }
  }
  const picked = selectQuestions(bank, room.settings.categories, room.settings.questionCount, rng);
  if (picked.length === 0) throw new GameError('no_questions', 'Không có câu hỏi phù hợp.', 500);
  priv.questionIds = picked.map((q) => q.id);
  room.qTotal = picked.length;
  room.startedAt = now;
  openQuestion(room, priv, bank, 0, now);
}

function bankById(bank: readonly BankQuestion[], id: string): BankQuestion {
  const q = bank.find((x) => x.id === id);
  if (!q) throw new GameError('missing_question', `Thiếu câu hỏi ${id}.`, 500);
  return q;
}

export function openQuestion(room: RoomDoc, priv: RoomPrivate, bank: readonly BankQuestion[], index: number, now: number) {
  const q = bankById(bank, priv.questionIds[index] as string);
  // Seed per room + question so a retried transaction produces the same shuffle and bot plans.
  const rng = seededRng(`${room.code}:${room.startedAt}:${index}`);
  const { pub, key } = preparePublic(q, rng);
  const openedAt = now + OPEN_DELAY_MS;
  const deadline = openedAt + timeLimitOf(q) * 1000;
  const botPlans: Record<string, BotPlan> = {};
  const botAnswerAt: Record<string, number> = {};
  for (const id of room.order) {
    const p = room.players[id];
    if (!p?.bot) continue;
    const plan = planBotAnswer(p.level ?? 'medium', pub, key, openedAt, rng);
    botPlans[id] = plan;
    botAnswerAt[id] = plan.at;
  }
  room.status = 'question';
  room.qIndex = index;
  room.current = { q: pub, openedAt, deadline, botAnswerAt };
  room.answered = {};
  room.reveal = null;
  priv.key = key;
  priv.answers = {};
  priv.botPlans = botPlans;
  priv.hints = {};
  room.version++;
}

function requireQuestion(room: RoomDoc, qIndex: number) {
  if (room.status !== 'question' || !room.current) throw new GameError('not_open', 'Câu hỏi đã đóng.', 409);
  if (qIndex !== room.qIndex) throw new GameError('stale', 'Câu hỏi đã chuyển.', 409);
  return room.current;
}

function requireHuman(room: RoomDoc, playerId: string) {
  const p = room.players[playerId];
  if (!p || p.bot) throw new GameError('no_player', 'Không có người chơi này.', 404);
  return p;
}

/** Returns true when this answer closed the question (everyone has answered). */
export function submitAnswer(
  room: RoomDoc,
  priv: RoomPrivate,
  bank: readonly BankQuestion[],
  playerId: string,
  qIndex: number,
  input: AnswerInput,
  now: number,
): boolean {
  const cur = requireQuestion(room, qIndex);
  requireHuman(room, playerId);
  if (priv.answers[playerId]) throw new GameError('answered', 'Bạn đã trả lời câu này.', 409);
  if (now > cur.deadline + ANSWER_GRACE_MS) throw new GameError('late', 'Hết giờ.', 409);
  if (!isValidInput(cur.q, input)) throw new GameError('bad_input', 'Câu trả lời không hợp lệ.');
  priv.answers[playerId] = { input, at: Math.max(now, cur.openedAt), hint: Boolean(priv.hints[playerId]) };
  room.answered[playerId] = true;
  room.version++;
  if (humans(room).every((id) => priv.answers[id])) {
    closeQuestion(room, priv, bank, now);
    return true;
  }
  return false;
}

export function useHint(room: RoomDoc, priv: RoomPrivate, playerId: string, qIndex: number, now: number): HintPayload {
  const cur = requireQuestion(room, qIndex);
  const p = requireHuman(room, playerId);
  const existing = priv.hints[playerId];
  if (existing) return existing;
  if (priv.answers[playerId]) throw new GameError('answered', 'Bạn đã trả lời câu này.', 409);
  if (now > cur.deadline) throw new GameError('late', 'Hết giờ.', 409);
  if (p.hintsLeft <= 0) throw new GameError('no_hints', 'Bạn đã dùng hết lượt Kiểm chứng.', 409);
  if (!priv.key) throw new GameError('no_key', 'Thiếu đáp án.', 500);
  const hint = buildHint(cur.q, priv.key, seededRng(`${room.code}:${qIndex}:${playerId}:hint`));
  priv.hints[playerId] = hint;
  p.hintsLeft--;
  room.version++;
  return hint;
}

export function closeQuestion(room: RoomDoc, priv: RoomPrivate, bank: readonly BankQuestion[], now: number) {
  const cur = room.current;
  const key = priv.key;
  if (room.status !== 'question' || !cur || !key) throw new GameError('not_open', 'Câu hỏi đã đóng.', 409);
  const limitMs = cur.q.timeLimitSec * 1000;
  const results: Record<string, PlayerResult> = {};
  const distribution = cur.q.kind === 'choice' ? new Array<number>(cur.q.options?.length ?? 0).fill(0) : undefined;
  for (const id of room.order) {
    const p = room.players[id];
    if (!p) continue;
    const plan = p.bot ? priv.botPlans[id] : undefined;
    const human = p.bot ? undefined : priv.answers[id];
    const input = plan?.input ?? human?.input;
    const at = plan?.at ?? human?.at;
    const answered = Boolean(input);
    const hint = Boolean(human?.hint);
    const fraction = answered ? gradeFraction(key, input) : 0;
    const elapsedMs = at !== undefined ? Math.max(0, at - cur.openedAt) : limitMs;
    const points = computePoints({ answered, fraction, elapsedMs, limitMs, hint, streakBefore: p.streak });
    p.score = Math.max(0, p.score + points);
    if (fraction >= 1) {
      p.correct++;
      p.streak++;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
    } else {
      p.streak = 0;
    }
    const stat = p.stats[cur.q.category] ?? { n: 0, ok: 0 };
    stat.n++;
    if (fraction >= 1) stat.ok++;
    p.stats[cur.q.category] = stat;
    if (distribution && input?.kind === 'choice' && distribution[input.option] !== undefined) distribution[input.option]!++;
    results[id] = { answered, points, fraction, ...(input ? { input } : {}), ...(hint ? { hint } : {}), ...(at !== undefined ? { elapsedMs } : {}) };
  }
  const meta = bank.find((q) => q.id === cur.q.id);
  room.reveal = {
    qIndex: room.qIndex,
    key,
    explanation: meta?.explanation ?? '',
    source: meta?.source ?? '',
    results,
    ...(distribution ? { distribution } : {}),
    revealedAt: now,
  };
  room.status = 'reveal';
  room.version++;
}

export function nextQuestion(room: RoomDoc, priv: RoomPrivate, bank: readonly BankQuestion[], now: number) {
  if (room.status !== 'reveal') throw new GameError('not_reveal', 'Chưa thể sang câu tiếp.', 409);
  if (room.qIndex + 1 >= room.qTotal) {
    finishGame(room, priv, bank, now);
    return;
  }
  openQuestion(room, priv, bank, room.qIndex + 1, now);
}

export function finishGame(room: RoomDoc, priv: RoomPrivate, bank: readonly BankQuestion[], now: number) {
  if (room.status === 'finished') return;
  if (room.status === 'question') closeQuestion(room, priv, bank, now);
  room.status = 'finished';
  room.finishedAt = now;
  priv.key = null;
  room.version++;
}

export interface AdvanceOptions {
  isHost: boolean;
  /** Only act if the room is still where the caller saw it (several clients call at once). */
  expectStatus?: RoomDoc['status'];
  expectQIndex?: number;
}

/**
 * Moves the game on when it is due: closes a question at its deadline,
 * and opens the next one when the host asks or the auto-next delay has passed.
 * Returns true if anything changed.
 */
export function advance(room: RoomDoc, priv: RoomPrivate, bank: readonly BankQuestion[], now: number, opts: AdvanceOptions): boolean {
  if (opts.expectStatus && opts.expectStatus !== room.status) return false;
  if (opts.expectQIndex !== undefined && opts.expectQIndex !== room.qIndex) return false;
  if (room.status === 'question' && room.current) {
    if (now >= room.current.deadline || humans(room).every((id) => priv.answers[id])) {
      closeQuestion(room, priv, bank, now);
      return true;
    }
    return false;
  }
  if (room.status === 'reveal' && room.reveal) {
    const auto = room.settings.autoNextSec > 0 && now >= room.reveal.revealedAt + room.settings.autoNextSec * 1000;
    if (opts.isHost || auto) {
      nextQuestion(room, priv, bank, now);
      return true;
    }
  }
  return false;
}

export function ranking(room: RoomDoc): PlayerPublic[] {
  return room.order
    .map((id) => room.players[id])
    .filter((p): p is PlayerPublic => Boolean(p))
    .sort((a, b) => b.score - a.score || b.correct - a.correct || a.joinedAt - b.joinedAt);
}

export interface LmsResult {
  playerId: string;
  binding: LmsBinding & { gradeTarget: string };
  /** 0..100: share of the played questions answered fully right. */
  score: number;
  comment: string;
  attemptId: string;
  occurredAt: string;
}

/** Grades to send once a room has finished: one per Moodle player whose activity has a gradebook column. */
export function lmsResults(room: RoomDoc, priv: RoomPrivate): LmsResult[] {
  if (room.status !== 'finished' || !priv.lti) return [];
  const played = Math.max(0, room.qIndex + 1);
  if (played === 0) return [];
  const ranked = ranking(room);
  const out: LmsResult[] = [];
  for (const [playerId, binding] of Object.entries(priv.lti)) {
    const p = room.players[playerId];
    if (!p || !binding.gradeTarget) continue;
    const rank = ranked.findIndex((x) => x.id === playerId) + 1;
    out.push({
      playerId,
      binding: { ...binding, gradeTarget: binding.gradeTarget },
      score: Math.round((p.correct / played) * 1000) / 10,
      comment: `Thám tử AI · phòng ${room.code} · hạng ${rank}/${ranked.length} · ${p.score} điểm trận · đúng ${p.correct}/${played} câu`,
      attemptId: `${room.code}:${playerId}`,
      occurredAt: new Date(room.finishedAt ?? Date.now()).toISOString(),
    });
  }
  return out;
}
