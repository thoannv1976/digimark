// Game 3 (Săn hợp đồng trọng điểm) through the API, against the Firestore emulator.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import type { AbmMe, AbmRoomDoc } from '@arena/engine';
import { buildApp } from '../src/app.js';
import { openFirestore } from '../src/firestore.js';

const HUB = 'https://hub.test';
const SECRET = 'test-secret-abm-0123456';
const db = openFirestore('demo-arena', '(default)');
let app: FastifyInstance;
let privateKey: CryptoKey;
const sent: Array<Record<string, unknown>> = [];
let clock = 1_800_400_000_000;

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is not set');
  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: 'k1', alg: 'RS256' };
  const fakeFetch = (async (_u: string, init: RequestInit) => {
    const { result_token } = JSON.parse(String(init.body)) as { result_token: string };
    const { payload } = await jwtVerify(result_token, new TextEncoder().encode(SECRET), { issuer: 'digimark', audience: HUB });
    sent.push(payload.result as Record<string, unknown>);
    return new Response(JSON.stringify({ status: 'queued' }), { status: 200 });
  }) as unknown as typeof fetch;
  app = await buildApp({ db, now: () => clock, lti: { hubUrl: HUB, gameId: 'digimark', secret: SECRET, jwks: createLocalJWKSet({ keys: [jwk] }), fetch: fakeFetch } });
});
afterAll(async () => app?.close());

async function post(url: string, payload: object) {
  const res = await app.inject({ method: 'POST', url, payload });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}
const roomOf = async (code: string) => (await db.doc(`rooms/${code}`).get()).data() as AbmRoomDoc;

async function ticket() {
  return new SignJWT({
    ugh: { tenantId: 'aiedu2026', platform: { issuer: 'https://aiedu2026.com', deploymentId: '9' }, ltiSub: 'u-k', name: 'Trần Thu', role: 'learner', context: { id: '70', title: 'DIGIMARK-PVN' }, resourceLink: { id: 'rl-k' }, activity: 'key-accounts', gradeTarget: 'gt-abm', launchId: 'l' },
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'unigamehub-launch+jwt', kid: 'k1' })
    .setIssuer(HUB).setAudience('digimark').setSubject('hub-user-abm').setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('2m')
    .sign(privateKey);
}

describe('Game 3 via API', () => {
  it('plays a solo key-accounts game from Moodle; the grade reaches the Hub', async () => {
    const launch = (await post('/api/lti/launch', { ticket: await ticket() })).body;
    expect(launch.activity).toBe('key-accounts');
    const created = await post('/api/rooms', { game: 'key-accounts', hostPlays: true, ltiSession: launch.session, settings: { monthSec: 0 } });
    expect(created.status).toBe(200);
    const { code, hostToken, playerId, playerToken } = created.body as Record<string, string>;
    expect((await roomOf(code!)).settings.monthSec).toBe(0);
    // other games' routes refuse this room
    expect((await post(`/api/rooms/${code}/decide`, { playerId, playerToken, quarter: 1, decision: { position: 'fast', targets: [], budget: {} } })).status).toBe(400);
    expect((await post(`/api/rooms/${code}/me`, { playerId, playerToken })).status).toBe(409);
    expect((await post(`/api/rooms/${code}/start`, { hostToken })).status).toBe(200);
    for (let m = 1; m <= 3; m++) {
      const room = await roomOf(code!);
      expect(room.status).toBe('decide');
      expect(room.round).toBe(m);
      const me = (await post(`/api/rooms/${code}/abm-me`, { playerId, playerToken })).body as unknown as AbmMe;
      expect(me.rel.NM13.buyer).toBeGreaterThanOrEqual(2);
      const over = await post(`/api/rooms/${code}/plan`, { playerId, playerToken, round: m, plan: { actions: [{ kind: 'trial', factory: 'NM05' }, { kind: 'trial', factory: 'NM19' }, { kind: 'trial', factory: 'NM22' }, { kind: 'fair' }] } });
      expect(over.status).toBe(400);
      const locked = await post(`/api/rooms/${code}/plan`, { playerId, playerToken, round: m, plan: { actions: [{ kind: 'meet', factory: 'NM28', role: 'ceo', evidence: 'green' }] } });
      if (m === 1) expect(locked.body.error).toBe('locked');
      const plan = { actions: [{ kind: 'interview', factory: 'NM22', role: 'buyer' }, { kind: 'meet', factory: 'NM22', role: 'buyer', evidence: 'stock' }, { kind: 'trial', factory: 'NM22' }, { kind: 'tco', factory: 'NM22' }, { kind: 'green', factory: 'NM22' }], ...(me.special ? { special: 'tco' } : {}) };
      const ok = await post(`/api/rooms/${code}/plan`, { playerId, playerToken, round: m, plan });
      expect(ok.body).toMatchObject({ ok: true, closed: true });
      const after = (await post(`/api/rooms/${code}/abm-me`, { playerId, playerToken })).body as unknown as AbmMe;
      expect(after.reports).toHaveLength(m);
      expect(after.known.NM22?.buyer?.pain1).toBeTruthy();
      clock += 1000;
      expect((await post(`/api/rooms/${code}/advance`, { hostToken, expectStatus: 'results', expectQuarter: m })).body.changed).toBe(true);
    }
    expect((await post(`/api/rooms/${code}/bids`, { playerId, playerToken, round: 4, bids: [{ factory: 'NM22', price: 'p3', cards: ['tech'] }] })).status).toBe(400);
    const bid = await post(`/api/rooms/${code}/bids`, { playerId, playerToken, round: 4, bids: [{ factory: 'NM22', price: 'p3', cards: ['quality', 'stock', 'tech'] }] });
    expect(bid.body).toMatchObject({ ok: true, closed: true });
    const room = await roomOf(code!);
    expect(room.status).toBe('finished');
    expect(room.awards).toHaveLength(8);
    expect(room.lmsStatus?.[playerId!]).toBe('sent');
    const mine = sent.find((r) => r.attempt_id === `${code}:${playerId}`)!;
    expect(mine.grade_target).toBe('gt-abm');
    expect(String(mine.comment)).toContain('Săn hợp đồng');
    // the hidden committees stay private until the host reveals them
    expect(JSON.stringify(room)).not.toContain('pains');
    expect(room.hidden).toBeNull();
    expect((await post(`/api/rooms/${code}/reveal`, { hostToken: 'x'.repeat(20) })).status).toBe(403);
    expect((await post(`/api/rooms/${code}/reveal`, { hostToken })).status).toBe(200);
    expect(Object.keys((await roomOf(code!)).hidden!)).toHaveLength(8);
  });

  it('facilitator room: brief + month timer, extend, defaults, end early', async () => {
    const host = (await post('/api/rooms', { game: 'key-accounts', hostPlays: false, settings: { monthSec: 240, briefSec: 120, bidSec: 180, fillBots: true } })).body as Record<string, string>;
    const a = (await post(`/api/rooms/${host.code}/join`, { name: 'An' })).body as Record<string, string>;
    expect((await post(`/api/rooms/${host.code}/start`, { hostToken: host.hostToken })).status).toBe(200);
    let room = await roomOf(host.code!);
    expect(room.order).toHaveLength(6);
    expect(room.deadline! - room.openedAt!).toBe(360_000);
    const deadline = room.deadline!;
    expect((await post(`/api/rooms/${host.code}/extend`, { hostToken: host.hostToken })).status).toBe(200);
    expect((await roomOf(host.code!)).deadline).toBe(deadline + 60_000);
    clock = deadline + 60_001;
    expect((await post(`/api/rooms/${host.code}/advance`, { expectStatus: 'decide', expectQuarter: 1 })).body.changed).toBe(true);
    room = await roomOf(host.code!);
    expect(room.status).toBe('results');
    expect(room.standings[a.playerId!]!.defaulted).toBe(true);
    expect(Object.keys(room.heat).length).toBeGreaterThan(0);
    expect((await post(`/api/rooms/${host.code}/join`, { name: 'Muộn' })).status).toBe(409);
    expect((await post(`/api/rooms/${host.code}/end`, { hostToken: host.hostToken })).status).toBe(200);
    room = await roomOf(host.code!);
    expect(room.status).toBe('finished');
    expect(room.awards).toHaveLength(8);
  });
});
