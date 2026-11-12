import { randomBytes, timingSafeEqual } from 'node:crypto';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  AI_DETECTIVE_BANK,
  CATEGORIES,
  ERROR_TYPES,
  GameError,
  advance,
  createRoom,
  finishGame,
  joinRoom,
  lmsResults,
  advanceMarket,
  createMarketRoom,
  extendMarket,
  finishMarket,
  joinMarket,
  marketLmsResults,
  marketMe,
  removeMarketPlayer,
  startMarket,
  submitDecision,
  BUDGET_KEYS,
  CARDS,
  SEGMENTS,
  randomRoomCode,
  removePlayer,
  startGame,
  submitAnswer,
  useHint,
  type BankQuestion,
  type LmsBinding,
  type LmsResult,
  type MarketPrivate,
  type MarketRoomDoc,
  type Rng,
  type RoomDoc,
  type RoomPrivate,
} from '@arena/engine';
import { displayName, submitResult, verifyTicket, type LtiConfig } from './lti.js';

export interface AppDeps {
  db: Firestore;
  now?: () => number;
  bank?: readonly BankQuestion[];
  logger?: boolean;
  /** Moodle via UniGame Hub; null/undefined = off. */
  lti?: LtiConfig | null;
}

/** A Moodle launch, kept 12 h so the student can create or join rooms without a new launch. */
interface LtiSession {
  hubUserId: string;
  name: string;
  role: 'instructor' | 'learner';
  gradeTarget?: string;
  contextTitle?: string;
  tenantId: string;
  expireAt: Date;
}
const LTI_SESSION_MS = 12 * 3600 * 1000;

/** Rooms are kept 3 days (Firestore TTL policy on `expireAt`). */
const ROOM_TTL_MS = 3 * 24 * 3600 * 1000;

const cryptoRng: Rng = () => randomBytes(4).readUInt32LE() / 4294967296;

const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,8}$/);
const token = z.string().min(10).max(80);
const settings = z
  .object({
    questionCount: z.number().int().min(5).max(30).optional(),
    botLevel: z.enum(['easy', 'medium', 'hard']).optional(),
    fillBots: z.boolean().optional(),
    categories: z.array(z.enum(CATEGORIES as [string, ...string[]])).max(6).optional(),
    autoNextSec: z.number().int().min(0).max(60).optional(),
  })
  .optional();
const marketSettings = z
  .object({
    quarters: z.number().int().min(3).max(5).optional(),
    decideSec: z.number().int().min(0).max(900).optional(),
    resultsSec: z.number().int().min(0).max(300).optional(),
    botLevel: z.enum(['easy', 'medium', 'hard']).optional(),
    fillBots: z.boolean().optional(),
  })
  .optional();
const marketDecision = z.object({
  position: z.enum(CARDS as [string, ...string[]]),
  targets: z.array(z.enum(SEGMENTS as [string, ...string[]])).max(2),
  budget: z.object(Object.fromEntries(BUDGET_KEYS.map((k) => [k, z.number().min(0).max(2)])) as Record<string, z.ZodNumber>),
  eventChoice: z.string().max(20).optional(),
});
const answerInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('choice'), option: z.number().int().min(0).max(10) }),
  z.object({ kind: z.literal('spot'), seg: z.number().int().min(0).max(20), type: z.enum(ERROR_TYPES as [string, ...string[]]) }),
  z.object({ kind: z.literal('order'), order: z.array(z.number().int().min(0).max(10)).min(1).max(10) }),
]);

const schemas = {
  create: z.object({
    title: z.string().max(40).optional(),
    hostPlays: z.boolean(),
    hostName: z.string().max(40).optional(),
    game: z.enum(['ai-detective', 'market-share']).optional(),
    // Parsed per game below (a union would let the quiz schema strip the market keys).
    settings: z.record(z.string(), z.unknown()).optional(),
    ltiSession: z.string().min(10).max(80).optional(),
  }),
  join: z.object({ name: z.string().max(40).optional(), ltiSession: z.string().min(10).max(80).optional() }),
  launch: z.object({ ticket: z.string().min(20).max(8000) }),
  host: z.object({ hostToken: token }),
  kick: z.object({ hostToken: token, playerId: z.string().max(40) }),
  answer: z.object({ playerId: z.string().max(40), playerToken: token, qIndex: z.number().int().min(0), input: answerInput }),
  hint: z.object({ playerId: z.string().max(40), playerToken: token, qIndex: z.number().int().min(0) }),
  advance: z.object({
    hostToken: token.optional(),
    expectStatus: z.enum(['lobby', 'question', 'reveal', 'finished', 'decide', 'results']).optional(),
    expectQIndex: z.number().int().min(-1).optional(),
    expectQuarter: z.number().int().min(0).optional(),
  }),
  decide: z.object({ playerId: z.string().max(40), playerToken: token, quarter: z.number().int().min(1), decision: marketDecision }),
  me: z.object({ playerId: z.string().max(40), playerToken: token }),
};

type AnyRoom = RoomDoc | MarketRoomDoc;
type AnyPriv = RoomPrivate | MarketPrivate;
const isMarket = (r: AnyRoom): r is MarketRoomDoc => r.game === 'market-share';

function sameToken(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { db } = deps;
  const now = deps.now ?? Date.now;
  const bank = deps.bank ?? AI_DETECTIVE_BANK;
  const rooms = db.collection('rooms');
  const app = Fastify({ logger: deps.logger ?? false, trustProxy: true, bodyLimit: 32 * 1024 });

  await app.register(helmet, { contentSecurityPolicy: false });
  // A whole class often shares one public IP, so the global limit is generous.
  await app.register(rateLimit, { max: 1200, timeWindow: '1 minute' });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof GameError) return reply.status(err.status).send({ error: err.code, message: err.message, serverNow: now() });
    if (err instanceof z.ZodError) return reply.status(400).send({ error: 'bad_request', message: 'Dữ liệu gửi lên không hợp lệ.', serverNow: now() });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.status(status).send({ error: 'error', message: status === 429 ? 'Thao tác quá nhanh, thử lại sau giây lát.' : 'Lỗi máy chủ.', serverNow: now() });
  });

  /** Load room + private state in a transaction, run `fn`, write back only if the room changed. */
  async function mutateAny<T>(roomCode: string, fn: (room: AnyRoom, priv: AnyPriv, t: number) => T): Promise<T> {
    const roomRef = rooms.doc(roomCode);
    const privRef = roomRef.collection('private').doc('state');
    let toSend: LmsResult[] = [];
    const result = await db.runTransaction(async (tx) => {
      toSend = [];
      const [rs, ps] = await tx.getAll(roomRef, privRef);
      if (!rs?.exists || !ps?.exists) throw new GameError('no_room', 'Không tìm thấy phòng. Kiểm tra lại mã phòng.', 404);
      const room = rs.data() as AnyRoom;
      const priv = ps.data() as AnyPriv;
      const before = room.version;
      const wasFinished = room.status === 'finished';
      const out = fn(room, priv, now());
      if (room.version !== before) {
        tx.set(roomRef, room);
        tx.set(privRef, priv);
      }
      if (!wasFinished && room.status === 'finished') {
        toSend = isMarket(room) ? marketLmsResults(room, priv as MarketPrivate) : lmsResults(room, priv as RoomPrivate);
      }
      return out;
    });
    if (toSend.length) await sendGrades(roomCode, toSend);
    return result;
  }

  /** Quiz-only routes. */
  const mutate = <T>(roomCode: string, fn: (room: RoomDoc, priv: RoomPrivate, t: number) => T) =>
    mutateAny(roomCode, (room, priv, t) => {
      if (isMarket(room)) throw new GameError('wrong_game', 'Phòng này là game Đấu trường Thị phần.', 409);
      return fn(room, priv as RoomPrivate, t);
    });
  /** Market-only routes. */
  const mutateMarket = <T>(roomCode: string, fn: (room: MarketRoomDoc, priv: MarketPrivate, t: number) => T) =>
    mutateAny(roomCode, (room, priv, t) => {
      if (!isMarket(room)) throw new GameError('wrong_game', 'Phòng này là game Thám tử AI.', 409);
      return fn(room, priv as MarketPrivate, t);
    });

  /** Sends each Moodle player's result to the Hub (which queues and retries delivery to Moodle). */
  async function sendGrades(roomCode: string, list: LmsResult[]) {
    const lti = deps.lti;
    if (!lti) return;
    const status: Record<string, 'sent' | 'error'> = {};
    await Promise.all(
      list.map(async (r) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await submitResult(lti, { gradeTarget: r.binding.gradeTarget, attemptId: r.attemptId, score: r.score, maxScore: 100, occurredAt: r.occurredAt, comment: r.comment });
            status[r.playerId] = 'sent';
            return;
          } catch (err) {
            app.log.warn({ err, room: roomCode, player: r.playerId }, 'grade submit failed');
            await new Promise((ok) => setTimeout(ok, 400 * (attempt + 1)));
          }
        }
        status[r.playerId] = 'error';
      }),
    );
    await rooms.doc(roomCode).set({ lmsStatus: status }, { merge: true });
    await db
      .collection('ltiResults')
      .doc(roomCode)
      .set({ results: list.map((r) => ({ ...r, status: status[r.playerId] })), expireAt: new Date(now() + 90 * 24 * 3600 * 1000) });
  }

  async function loadLtiSession(id: string | undefined): Promise<LtiSession | null> {
    if (!id) return null;
    if (!deps.lti) throw new GameError('lti_off', 'Chưa bật kết nối Moodle.', 404);
    const snap = await db.collection('ltiSessions').doc(id).get();
    const s = snap.data() as (Omit<LtiSession, 'expireAt'> & { expireAt: { toMillis(): number } }) | undefined;
    if (!s || s.expireAt.toMillis() < now()) throw new GameError('lti_expired', 'Phiên mở từ Moodle đã hết hạn. Mở lại hoạt động trong Moodle.', 401);
    return { ...s, expireAt: new Date(s.expireAt.toMillis()) };
  }
  const bindingOf = (s: LtiSession): LmsBinding => ({ hubUserId: s.hubUserId, ...(s.gradeTarget ? { gradeTarget: s.gradeTarget } : {}) });

  const parseCode = (params: unknown) => code.parse((params as { code: string }).code);

  function requirePlayer(priv: { tokens: Record<string, string> }, playerId: string, playerToken: string) {
    if (!sameToken(priv.tokens[playerId], playerToken)) throw new GameError('forbidden', 'Phiên chơi không hợp lệ. Vào lại phòng.', 403);
  }
  function requireHost(priv: { hostToken: string }, hostToken: string | undefined) {
    if (!sameToken(priv.hostToken, hostToken)) throw new GameError('forbidden', 'Chỉ chủ phòng làm được việc này.', 403);
  }

  app.get('/api/health', async () => ({ ok: true, questions: bank.length }));
  app.get('/api/time', async () => ({ serverNow: now() }));

  // Moodle -> Hub -> /lti-launch#ticket=... -> here. Off (404) unless LTI is configured; a bad ticket -> 401.
  app.post('/api/lti/launch', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const lti = deps.lti;
    if (!lti) return reply.status(404).send({ error: 'lti_off', message: 'Chưa bật kết nối Moodle.' });
    const { ticket } = schemas.launch.parse(req.body);
    let ctx;
    try {
      ctx = await verifyTicket(lti, ticket);
    } catch {
      return reply.status(401).send({ error: 'LTI_TICKET_INVALID', message: 'Vé đăng nhập từ Moodle không hợp lệ hoặc đã hết hạn. Mở lại hoạt động trong Moodle.' });
    }
    try {
      await db.collection('ltiTickets').doc(ctx.ticketId).create({ expireAt: ctx.expiresAt });
    } catch {
      return reply.status(401).send({ error: 'LTI_TICKET_USED', message: 'Vé đăng nhập đã được dùng. Mở lại hoạt động trong Moodle.' });
    }
    const id = randomBytes(24).toString('base64url');
    const session: LtiSession = {
      hubUserId: ctx.hubUserId,
      name: displayName(ctx),
      role: ctx.role,
      tenantId: ctx.tenantId,
      ...(ctx.gradeTarget ? { gradeTarget: ctx.gradeTarget } : {}),
      ...(ctx.context?.title ? { contextTitle: ctx.context.title } : {}),
      expireAt: new Date(now() + LTI_SESSION_MS),
    };
    await db.collection('ltiSessions').doc(id).set(session);
    return { session: id, role: session.role, name: session.name, contextTitle: session.contextTitle ?? null, graded: Boolean(session.gradeTarget), activity: ctx.activity ?? null, serverNow: now() };
  });

  app.post('/api/rooms', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const body = schemas.create.parse(req.body);
    const gameSettings = body.game === 'market-share' ? marketSettings.parse(body.settings) : settings.parse(body.settings);
    const lms = await loadLtiSession(body.ltiSession);
    if (lms && body.hostPlays && !body.hostName?.trim()) body.hostName = lms.name;
    if (body.hostPlays && !body.hostName?.trim()) throw new GameError('bad_name', 'Vui lòng nhập tên.');
    for (let attempt = 0; attempt < 6; attempt++) {
      const roomCode = randomRoomCode(cryptoRng);
      const t = now();
      const common = { code: roomCode, hostPlays: body.hostPlays, ...(body.title ? { title: body.title } : {}), ...(body.hostName ? { hostName: body.hostName } : {}), ...(gameSettings ? { settings: gameSettings as never } : {}), ...(lms && body.hostPlays ? { hostLms: bindingOf(lms) } : {}) };
      const created = body.game === 'market-share' ? createMarketRoom(common, t, cryptoRng) : createRoom(common, t, cryptoRng);
      const expireAt = new Date(t + ROOM_TTL_MS);
      const roomRef = rooms.doc(roomCode);
      const ok = await db.runTransaction(async (tx) => {
        const existing = await tx.get(roomRef);
        if (existing.exists) return false;
        tx.set(roomRef, { ...created.room, expireAt });
        tx.set(roomRef.collection('private').doc('state'), { ...created.priv, expireAt });
        return true;
      });
      if (ok) {
        return {
          code: roomCode,
          hostToken: created.hostToken,
          ...(created.player ? { playerId: created.player.playerId, playerToken: created.player.playerToken } : {}),
          serverNow: now(),
        };
      }
    }
    throw new GameError('busy', 'Không tạo được mã phòng, thử lại.', 503);
  });

  app.post('/api/rooms/:code/join', async (req) => {
    const roomCode = parseCode(req.params);
    const body = schemas.join.parse(req.body);
    const lms = await loadLtiSession(body.ltiSession);
    const name = body.name?.trim() || lms?.name || '';
    const player = await mutateAny(roomCode, (room, priv, t) =>
      isMarket(room)
        ? joinMarket(room, priv as MarketPrivate, name, t, cryptoRng, lms ? bindingOf(lms) : undefined)
        : joinRoom(room, priv as RoomPrivate, name, t, cryptoRng, lms ? bindingOf(lms) : undefined),
    );
    return { ...player, serverNow: now() };
  });

  app.post('/api/rooms/:code/start', async (req) => {
    const roomCode = parseCode(req.params);
    const { hostToken } = schemas.host.parse(req.body);
    await mutateAny(roomCode, (room, priv, t) => {
      requireHost(priv, hostToken);
      if (isMarket(room)) startMarket(room, priv as MarketPrivate, t, cryptoRng);
      else startGame(room, priv as RoomPrivate, bank, t, cryptoRng);
    });
    return { ok: true, serverNow: now() };
  });

  app.post('/api/rooms/:code/kick', async (req) => {
    const roomCode = parseCode(req.params);
    const { hostToken, playerId } = schemas.kick.parse(req.body);
    await mutateAny(roomCode, (room, priv) => {
      requireHost(priv, hostToken);
      if (isMarket(room)) removeMarketPlayer(room, priv as MarketPrivate, playerId);
      else removePlayer(room, priv as RoomPrivate, playerId);
    });
    return { ok: true, serverNow: now() };
  });

  app.post('/api/rooms/:code/answer', async (req) => {
    const roomCode = parseCode(req.params);
    const body = schemas.answer.parse(req.body);
    const closed = await mutate(roomCode, (room, priv, t) => {
      requirePlayer(priv, body.playerId, body.playerToken);
      return submitAnswer(room, priv, bank, body.playerId, body.qIndex, body.input as never, t);
    });
    return { ok: true, closed, serverNow: now() };
  });

  app.post('/api/rooms/:code/hint', async (req) => {
    const roomCode = parseCode(req.params);
    const body = schemas.hint.parse(req.body);
    const hint = await mutate(roomCode, (room, priv, t) => {
      requirePlayer(priv, body.playerId, body.playerToken);
      return useHint(room, priv, body.playerId, body.qIndex, t);
    });
    return { hint, serverNow: now() };
  });

  // Anyone in the room may ask to close a question whose time is up; moving to the next one needs the host
  // (or the auto-next delay). Several clients call at once – `expect*` makes the extra calls no-ops.
  app.post('/api/rooms/:code/advance', async (req) => {
    const roomCode = parseCode(req.params);
    const body = schemas.advance.parse(req.body);
    const changed = await mutateAny(roomCode, (room, privAny, t) => {
      const isHost = sameToken(privAny.hostToken, body.hostToken);
      if (isMarket(room)) {
        return advanceMarket(room, privAny as MarketPrivate, t, {
          isHost,
          ...(body.expectStatus ? { expectStatus: body.expectStatus as MarketRoomDoc['status'] } : {}),
          ...(body.expectQuarter !== undefined ? { expectQuarter: body.expectQuarter } : {}),
        });
      }
      const priv = privAny as RoomPrivate;
      return advance(room, priv, bank, t, {
        isHost,
        ...(body.expectStatus ? { expectStatus: body.expectStatus as RoomDoc['status'] } : {}),
        ...(body.expectQIndex !== undefined ? { expectQIndex: body.expectQIndex } : {}),
      });
    });
    return { changed, serverNow: now() };
  });

  app.post('/api/rooms/:code/end', async (req) => {
    const roomCode = parseCode(req.params);
    const { hostToken } = schemas.host.parse(req.body);
    await mutateAny(roomCode, (room, priv, t) => {
      requireHost(priv, hostToken);
      if (room.status === 'lobby') throw new GameError('not_started', 'Trò chơi chưa bắt đầu.', 409);
      if (isMarket(room)) finishMarket(room, priv as MarketPrivate, t);
      else finishGame(room, priv as RoomPrivate, bank, t);
    });
    return { ok: true, serverNow: now() };
  });

  // ───────── Game 1 – Đấu trường Thị phần ─────────
  app.post('/api/rooms/:code/decide', async (req) => {
    const roomCode = parseCode(req.params);
    const body = schemas.decide.parse(req.body);
    const closed = await mutateMarket(roomCode, (room, priv, t) => {
      requirePlayer(priv, body.playerId, body.playerToken);
      return submitDecision(room, priv, body.playerId, body.quarter, body.decision as never, t);
    });
    return { ok: true, closed, serverNow: now() };
  });

  app.post('/api/rooms/:code/extend', async (req) => {
    const roomCode = parseCode(req.params);
    const { hostToken } = schemas.host.parse(req.body);
    await mutateMarket(roomCode, (room, priv) => {
      requireHost(priv, hostToken);
      extendMarket(room, 60);
    });
    return { ok: true, serverNow: now() };
  });

  // POST so the player token stays out of URLs and logs.
  app.post('/api/rooms/:code/me', async (req) => {
    const roomCode = parseCode(req.params);
    const body = schemas.me.parse(req.body);
    const roomRef = rooms.doc(roomCode);
    const [rs, ps] = await db.getAll(roomRef, roomRef.collection('private').doc('state'));
    if (!rs?.exists || !ps?.exists) throw new GameError('no_room', 'Không tìm thấy phòng.', 404);
    const room = rs.data() as AnyRoom;
    const priv = ps.data() as AnyPriv;
    if (!isMarket(room)) throw new GameError('wrong_game', 'Phòng này là game Thám tử AI.', 409);
    requirePlayer(priv, body.playerId, body.playerToken);
    return { ...marketMe(room, priv as MarketPrivate, body.playerId), serverNow: now() };
  });

  return app;
}
