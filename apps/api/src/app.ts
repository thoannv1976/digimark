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
  randomRoomCode,
  removePlayer,
  startGame,
  submitAnswer,
  useHint,
  type BankQuestion,
  type Rng,
  type RoomDoc,
  type RoomPrivate,
} from '@arena/engine';

export interface AppDeps {
  db: Firestore;
  now?: () => number;
  bank?: readonly BankQuestion[];
  logger?: boolean;
}

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
    settings,
  }),
  join: z.object({ name: z.string().max(40) }),
  host: z.object({ hostToken: token }),
  kick: z.object({ hostToken: token, playerId: z.string().max(40) }),
  answer: z.object({ playerId: z.string().max(40), playerToken: token, qIndex: z.number().int().min(0), input: answerInput }),
  hint: z.object({ playerId: z.string().max(40), playerToken: token, qIndex: z.number().int().min(0) }),
  advance: z.object({
    hostToken: token.optional(),
    expectStatus: z.enum(['lobby', 'question', 'reveal', 'finished']).optional(),
    expectQIndex: z.number().int().min(-1).optional(),
  }),
};

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
  async function mutate<T>(roomCode: string, fn: (room: RoomDoc, priv: RoomPrivate, t: number) => T): Promise<T> {
    const roomRef = rooms.doc(roomCode);
    const privRef = roomRef.collection('private').doc('state');
    return db.runTransaction(async (tx) => {
      const [rs, ps] = await tx.getAll(roomRef, privRef);
      if (!rs?.exists || !ps?.exists) throw new GameError('no_room', 'Không tìm thấy phòng. Kiểm tra lại mã phòng.', 404);
      const room = rs.data() as RoomDoc;
      const priv = ps.data() as RoomPrivate;
      const before = room.version;
      const result = fn(room, priv, now());
      if (room.version !== before) {
        tx.set(roomRef, room);
        tx.set(privRef, priv);
      }
      return result;
    });
  }

  const parseCode = (params: unknown) => code.parse((params as { code: string }).code);

  function requirePlayer(priv: RoomPrivate, playerId: string, playerToken: string) {
    if (!sameToken(priv.tokens[playerId], playerToken)) throw new GameError('forbidden', 'Phiên chơi không hợp lệ. Vào lại phòng.', 403);
  }
  function requireHost(priv: RoomPrivate, hostToken: string | undefined) {
    if (!sameToken(priv.hostToken, hostToken)) throw new GameError('forbidden', 'Chỉ chủ phòng làm được việc này.', 403);
  }

  app.get('/api/health', async () => ({ ok: true, questions: bank.length }));
  app.get('/api/time', async () => ({ serverNow: now() }));

  app.post('/api/rooms', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const body = schemas.create.parse(req.body);
    if (body.hostPlays && !body.hostName?.trim()) throw new GameError('bad_name', 'Vui lòng nhập tên.');
    for (let attempt = 0; attempt < 6; attempt++) {
      const roomCode = randomRoomCode(cryptoRng);
      const t = now();
      const created = createRoom({ code: roomCode, hostPlays: body.hostPlays, ...(body.title ? { title: body.title } : {}), ...(body.hostName ? { hostName: body.hostName } : {}), ...(body.settings ? { settings: body.settings as never } : {}) }, t, cryptoRng);
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
    const { name } = schemas.join.parse(req.body);
    const player = await mutate(roomCode, (room, priv, t) => joinRoom(room, priv, name, t, cryptoRng));
    return { ...player, serverNow: now() };
  });

  app.post('/api/rooms/:code/start', async (req) => {
    const roomCode = parseCode(req.params);
    const { hostToken } = schemas.host.parse(req.body);
    await mutate(roomCode, (room, priv, t) => {
      requireHost(priv, hostToken);
      startGame(room, priv, bank, t, cryptoRng);
    });
    return { ok: true, serverNow: now() };
  });

  app.post('/api/rooms/:code/kick', async (req) => {
    const roomCode = parseCode(req.params);
    const { hostToken, playerId } = schemas.kick.parse(req.body);
    await mutate(roomCode, (room, priv) => {
      requireHost(priv, hostToken);
      removePlayer(room, priv, playerId);
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
    const changed = await mutate(roomCode, (room, priv, t) => {
      const isHost = sameToken(priv.hostToken, body.hostToken);
      return advance(room, priv, bank, t, {
        isHost,
        ...(body.expectStatus ? { expectStatus: body.expectStatus } : {}),
        ...(body.expectQIndex !== undefined ? { expectQIndex: body.expectQIndex } : {}),
      });
    });
    return { changed, serverNow: now() };
  });

  app.post('/api/rooms/:code/end', async (req) => {
    const roomCode = parseCode(req.params);
    const { hostToken } = schemas.host.parse(req.body);
    await mutate(roomCode, (room, priv, t) => {
      requireHost(priv, hostToken);
      if (room.status === 'lobby') throw new GameError('not_started', 'Trò chơi chưa bắt đầu.', 409);
      finishGame(room, priv, bank, t);
    });
    return { ok: true, serverNow: now() };
  });

  return app;
}
