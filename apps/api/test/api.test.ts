// Runs against the Firestore emulator: npm run test:integration (from the repo root, via the C:\gh junction on Windows).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AnswerInput, RoomDoc, RoomPrivate } from '@arena/engine';
import { buildApp } from '../src/app.js';
import { openFirestore } from '../src/firestore.js';

const db = openFirestore('demo-arena', '(default)');
let app: FastifyInstance;
let clock = 1_800_000_000_000;

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is not set – run through firebase emulators:exec');
  app = await buildApp({ db, now: () => clock });
});
afterAll(async () => app?.close());

async function post(url: string, payload: object) {
  const res = await app.inject({ method: 'POST', url, payload });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}
const roomOf = async (code: string) => (await db.doc(`rooms/${code}`).get()).data() as RoomDoc;
const privOf = async (code: string) => (await db.doc(`rooms/${code}/private/state`).get()).data() as RoomPrivate;
function right(priv: RoomPrivate): AnswerInput {
  const k = priv.key!;
  if (k.kind === 'choice') return { kind: 'choice', option: k.option };
  if (k.kind === 'spot') return { kind: 'spot', seg: k.seg, type: k.type };
  return { kind: 'order', order: k.order };
}

describe('API against Firestore emulator', () => {
  it('plays a solo game against bots end to end', async () => {
    const created = await post('/api/rooms', { hostPlays: true, hostName: 'Lan', settings: { questionCount: 5, botLevel: 'easy' } });
    expect(created.status).toBe(200);
    const { code, hostToken, playerId, playerToken } = created.body as Record<string, string>;
    expect(code).toMatch(/^[A-Z0-9]{5}$/);

    expect((await post(`/api/rooms/${code}/start`, { hostToken: 'x'.repeat(32) })).status).toBe(403);
    expect((await post(`/api/rooms/${code}/start`, { hostToken })).status).toBe(200);
    let room = await roomOf(code!);
    expect(room.order).toHaveLength(6);
    expect(JSON.stringify(room)).not.toContain(hostToken!);

    for (let i = 0; i < 5; i++) {
      room = await roomOf(code!);
      clock = room.current!.openedAt + 1000;
      const priv = await privOf(code!);
      const ans = await post(`/api/rooms/${code}/answer`, { playerId, playerToken, qIndex: i, input: right(priv) });
      expect(ans.body).toMatchObject({ ok: true, closed: true });
      clock += 500;
      // A player without the host token cannot skip ahead.
      expect((await post(`/api/rooms/${code}/advance`, { expectStatus: 'reveal' })).body.changed).toBe(false);
      expect((await post(`/api/rooms/${code}/advance`, { hostToken, expectStatus: 'reveal', expectQIndex: i })).body.changed).toBe(true);
    }
    room = await roomOf(code!);
    expect(room.status).toBe('finished');
    expect(room.players[playerId!]!.correct).toBe(5);
    expect((await privOf(code!)).key).toBeNull();
  });

  it('runs a facilitator room with two players, deadline close and hints', async () => {
    const created = await post('/api/rooms', { hostPlays: false, title: 'Phòng 1', settings: { questionCount: 5, fillBots: false, autoNextSec: 5 } });
    const { code, hostToken } = created.body as Record<string, string>;
    const a = (await post(`/api/rooms/${code}/join`, { name: 'An' })).body as Record<string, string>;
    const b = (await post(`/api/rooms/${code}/join`, { name: 'An' })).body as Record<string, string>;
    let room = await roomOf(code!);
    expect(room.players[b.playerId!]!.name).toBe('An (2)');

    expect((await post(`/api/rooms/${code}/answer`, { playerId: a.playerId, playerToken: a.playerToken, qIndex: 0, input: { kind: 'choice', option: 0 } })).status).toBe(409);
    await post(`/api/rooms/${code}/start`, { hostToken });
    room = await roomOf(code!);
    clock = room.current!.openedAt;

    const hint = await post(`/api/rooms/${code}/hint`, { playerId: a.playerId, playerToken: a.playerToken, qIndex: 0 });
    expect(hint.status).toBe(200);
    expect(hint.body.hint).toBeTruthy();
    expect((await post(`/api/rooms/${code}/hint`, { playerId: a.playerId, playerToken: b.playerToken, qIndex: 0 })).status).toBe(403);

    const priv = await privOf(code!);
    expect((await post(`/api/rooms/${code}/answer`, { playerId: a.playerId, playerToken: a.playerToken, qIndex: 0, input: right(priv) })).body.closed).toBe(false);
    // Too early: nobody can close the question yet.
    expect((await post(`/api/rooms/${code}/advance`, { expectStatus: 'question' })).body.changed).toBe(false);
    clock = room.current!.deadline;
    expect((await post(`/api/rooms/${code}/advance`, { expectStatus: 'question' })).body.changed).toBe(true);
    room = await roomOf(code!);
    expect(room.reveal!.results[a.playerId!]!.hint).toBe(true);
    expect(room.reveal!.results[b.playerId!]!.answered).toBe(false);

    // Auto-next after 5 s, triggered by any client.
    clock += 5000;
    expect((await post(`/api/rooms/${code}/advance`, { expectStatus: 'reveal' })).body.changed).toBe(true);
    expect((await roomOf(code!)).qIndex).toBe(1);

    expect((await post(`/api/rooms/${code}/end`, { hostToken })).status).toBe(200);
    expect((await roomOf(code!)).status).toBe('finished');
  });

  it('returns clear errors for unknown rooms and bad input', async () => {
    const r = await post('/api/rooms/ZZZZZ/join', { name: 'X' });
    expect(r.status).toBe(404);
    expect(r.body.message).toMatch(/Không tìm thấy phòng/);
    expect((await post('/api/rooms', { hostPlays: true })).status).toBe(400);
  });
});
