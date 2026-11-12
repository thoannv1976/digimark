// Moodle (via UniGame Hub) launch + grade passback, against the Firestore emulator with a fake Hub.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import type { AnswerInput, RoomDoc, RoomPrivate } from '@arena/engine';
import { buildApp } from '../src/app.js';
import { openFirestore } from '../src/firestore.js';

const HUB = 'https://hub.test';
const SECRET = 'test-secret-0123456789';
const db = openFirestore('demo-arena', '(default)');
let app: FastifyInstance;
let offApp: FastifyInstance;
let privateKey: CryptoKey;
const sent: Array<Record<string, unknown>> = [];
let clock = 1_800_100_000_000;

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is not set');
  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: 'k1', alg: 'RS256' };
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    const { result_token } = JSON.parse(String(init.body)) as { result_token: string };
    const { payload } = await jwtVerify(result_token, new TextEncoder().encode(SECRET), { issuer: 'digimark', audience: HUB });
    sent.push(payload.result as Record<string, unknown>);
    return new Response(JSON.stringify({ status: 'queued' }), { status: 200 });
  }) as unknown as typeof fetch;
  app = await buildApp({ db, now: () => clock, lti: { hubUrl: HUB, gameId: 'digimark', secret: SECRET, jwks: createLocalJWKSet({ keys: [jwk] }), fetch: fakeFetch } });
  offApp = await buildApp({ db, now: () => clock });
});
afterAll(async () => {
  await app?.close();
  await offApp?.close();
});

async function ticket(over: Record<string, unknown> = {}, jti = crypto.randomUUID()) {
  return new SignJWT({
    ugh: {
      tenantId: 'aiedu2026',
      platform: { issuer: 'https://aiedu2026.com', deploymentId: '9' },
      ltiSub: 'u-1',
      name: 'Nguyễn Văn An',
      role: 'learner',
      context: { id: '70', title: 'DIGIMARK-PVN' },
      resourceLink: { id: 'rl-1' },
      activity: 'ai-detective',
      gradeTarget: 'gt-123',
      launchId: 'l-1',
      ...over,
    },
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'unigamehub-launch+jwt', kid: 'k1' })
    .setIssuer(HUB)
    .setAudience('digimark')
    .setSubject((over.sub as string) ?? 'hub-user-1')
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(privateKey);
}

async function post(a: FastifyInstance, url: string, payload: object) {
  const res = await a.inject({ method: 'POST', url, payload });
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

describe('Moodle launch via UniGame Hub', () => {
  it('is off (404) without LTI config and rejects bad or reused tickets', async () => {
    expect((await post(offApp, '/api/lti/launch', { ticket: 'x'.repeat(40) })).status).toBe(404);
    expect((await post(app, '/api/lti/launch', { ticket: 'x'.repeat(40) })).status).toBe(401);
    const t = await ticket();
    expect((await post(app, '/api/lti/launch', { ticket: t })).status).toBe(200);
    expect((await post(app, '/api/lti/launch', { ticket: t })).body.error).toBe('LTI_TICKET_USED');
  });

  it('a learner plays solo from Moodle and the grade reaches the Hub', async () => {
    const launch = (await post(app, '/api/lti/launch', { ticket: await ticket() })).body;
    expect(launch).toMatchObject({ role: 'learner', name: 'Nguyễn Văn An', contextTitle: 'DIGIMARK-PVN', graded: true });
    const created = await post(app, '/api/rooms', { hostPlays: true, ltiSession: launch.session, settings: { questionCount: 5 } });
    expect(created.status).toBe(200);
    const { code, hostToken, playerId, playerToken } = created.body as Record<string, string>;
    let room = await roomOf(code!);
    expect(room.players[playerId!]).toMatchObject({ name: 'Nguyễn Văn An', lms: true });
    await post(app, `/api/rooms/${code}/start`, { hostToken });
    for (let i = 0; i < 5; i++) {
      room = await roomOf(code!);
      clock = room.current!.openedAt + 500;
      const priv = await privOf(code!);
      // Right on 4 of 5 questions.
      const input = i === 2 ? { kind: 'choice', option: 99 } : right(priv);
      if (i === 2) clock = room.current!.deadline + 1;
      if (i === 2) await post(app, `/api/rooms/${code}/advance`, { expectStatus: 'question' });
      else await post(app, `/api/rooms/${code}/answer`, { playerId, playerToken, qIndex: i, input });
      clock += 300;
      await post(app, `/api/rooms/${code}/advance`, { hostToken, expectStatus: 'reveal' });
    }
    room = await roomOf(code!);
    expect(room.status).toBe('finished');
    expect(room.lmsStatus?.[playerId!]).toBe('sent');
    const mine = sent.find((r) => r.attempt_id === `${code}:${playerId}`)!;
    expect(mine).toMatchObject({ grade_target: 'gt-123', score: 80, max_score: 100, activity_progress: 'Completed' });
    expect(String(mine.comment)).toContain('đúng 4/5 câu');
  });

  it('a learner joins a facilitator room; reopening Moodle gives back the same seat; bots are not graded', async () => {
    const host = (await post(app, '/api/rooms', { hostPlays: false, settings: { questionCount: 5, fillBots: true } })).body as Record<string, string>;
    const s1 = (await post(app, '/api/lti/launch', { ticket: await ticket({ sub: 'hub-user-2', name: 'Trần Bình' }) })).body;
    const j1 = (await post(app, `/api/rooms/${host.code}/join`, { ltiSession: s1.session })).body as Record<string, string>;
    const s2 = (await post(app, '/api/lti/launch', { ticket: await ticket({ sub: 'hub-user-2', name: 'Trần Bình' }) })).body;
    const j2 = (await post(app, `/api/rooms/${host.code}/join`, { ltiSession: s2.session })).body as Record<string, string>;
    expect(j2.playerId).toBe(j1.playerId);
    // Instructor launch without a gradebook column: no grade sent.
    const plain = (await post(app, '/api/lti/launch', { ticket: await ticket({ sub: 'hub-user-3', name: 'Lê Chi', gradeTarget: undefined }) })).body;
    expect(plain.graded).toBe(false);
    const j3 = (await post(app, `/api/rooms/${host.code}/join`, { ltiSession: plain.session })).body as Record<string, string>;
    await post(app, `/api/rooms/${host.code}/start`, { hostToken: host.hostToken });
    const before = sent.length;
    expect((await post(app, `/api/rooms/${host.code}/end`, { hostToken: host.hostToken })).status).toBe(200);
    const room = await roomOf(host.code!);
    expect(room.lmsStatus).toEqual({ [j1.playerId!]: 'sent' });
    expect(room.players[j3.playerId!]!.lms).toBeUndefined();
    expect(sent.length).toBe(before + 1);
  });

  it('rejects an unknown or expired Moodle session', async () => {
    const r = await post(app, '/api/rooms', { hostPlays: true, ltiSession: 'nope-nope-nope' });
    expect(r.status).toBe(401);
    const launch = (await post(app, '/api/lti/launch', { ticket: await ticket({ sub: 'hub-user-9' }) })).body;
    clock += 13 * 3600 * 1000;
    expect((await post(app, '/api/rooms', { hostPlays: true, ltiSession: launch.session })).status).toBe(401);
  });
});
