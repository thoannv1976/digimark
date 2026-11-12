// Game 1 (Đấu trường Thị phần) through the API, against the Firestore emulator.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import type { MarketRoomDoc } from '@arena/engine';
import { buildApp } from '../src/app.js';
import { openFirestore } from '../src/firestore.js';

const HUB = 'https://hub.test';
const SECRET = 'test-secret-market-0123';
const db = openFirestore('demo-arena', '(default)');
let app: FastifyInstance;
let privateKey: CryptoKey;
const sent: Array<Record<string, unknown>> = [];
let clock = 1_800_200_000_000;

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
const roomOf = async (code: string) => (await db.doc(`rooms/${code}`).get()).data() as MarketRoomDoc;

function decision(room: MarketRoomDoc, pid: string) {
  const special = room.event?.special?.playerId === pid ? room.event.special : null;
  const options = special ? special.options : room.event?.options;
  return {
    position: 'fivestar',
    targets: ['cars', 'households'],
    budget: { ads: 0.3, maps: 0.3, crm: 0.3, app: 0.2, training: 0.3, green: 0, promo: 0, research: 0.1 },
    ...(options ? { eventChoice: options[0]!.id } : {}),
  };
}

async function ticket() {
  return new SignJWT({
    ugh: { tenantId: 'aiedu2026', platform: { issuer: 'https://aiedu2026.com', deploymentId: '9' }, ltiSub: 'u-m', name: 'Phạm Minh', role: 'learner', context: { id: '70', title: 'DIGIMARK-PVN' }, resourceLink: { id: 'rl-m' }, activity: 'market-share', gradeTarget: 'gt-market', launchId: 'l' },
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'unigamehub-launch+jwt', kid: 'k1' })
    .setIssuer(HUB).setAudience('digimark').setSubject('hub-user-market').setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('2m')
    .sign(privateKey);
}

describe('Game 1 via API', () => {
  it('plays a solo market game from Moodle; the grade reaches the Hub', async () => {
    const launch = (await post('/api/lti/launch', { ticket: await ticket() })).body;
    const created = await post('/api/rooms', { game: 'market-share', hostPlays: true, ltiSession: launch.session, settings: { decideSec: 0 } });
    expect(created.status).toBe(200);
    expect((await roomOf((created.body as Record<string, string>).code!)).settings.decideSec).toBe(0);
    const { code, hostToken, playerId, playerToken } = created.body as Record<string, string>;
    // quiz routes refuse a market room
    expect((await post(`/api/rooms/${code}/answer`, { playerId, playerToken, qIndex: 0, input: { kind: 'choice', option: 0 } })).status).toBe(409);
    expect((await post(`/api/rooms/${code}/start`, { hostToken })).status).toBe(200);
    for (let q = 1; q <= 5; q++) {
      const room = await roomOf(code!);
      expect(room.status).toBe('decide');
      const bad = await post(`/api/rooms/${code}/decide`, { playerId, playerToken, quarter: q, decision: { ...decision(room, playerId!), budget: { ads: 2, maps: 0.5, crm: 0, app: 0, training: 0, green: 0, promo: 0, research: 0 } } });
      expect(bad.status).toBe(400);
      const ok = await post(`/api/rooms/${code}/decide`, { playerId, playerToken, quarter: q, decision: decision(room, playerId!) });
      expect(ok.body).toMatchObject({ ok: true, closed: true });
      const me = (await post(`/api/rooms/${code}/me`, { playerId, playerToken })).body as { reports: unknown[]; knownPrefs: Record<string, unknown> };
      expect(me.reports).toHaveLength(q);
      if (q === 1) expect(Object.keys(me.knownPrefs)).toContain('cars');
      clock += 1000;
      if (q < 5) expect((await post(`/api/rooms/${code}/advance`, { hostToken, expectStatus: 'results', expectQuarter: q })).body.changed).toBe(true);
    }
    const room = await roomOf(code!);
    expect(room.status).toBe('finished');
    expect(room.lmsStatus?.[playerId!]).toBe('sent');
    const mine = sent.find((r) => r.attempt_id === `${code}:${playerId}`)!;
    expect(mine.grade_target).toBe('gt-market');
    expect(Number(mine.score)).toBeGreaterThan(0);
    expect(String(mine.comment)).toContain('Đấu trường Thị phần');
    // the private doc stays private: the public room has no budgets of others
    expect(JSON.stringify(room)).not.toContain('"budget"');
  });

  it('facilitator room: timer, extend, default decisions, end early', async () => {
    const host = (await post('/api/rooms', { game: 'market-share', hostPlays: false, settings: { decideSec: 120, fillBots: true } })).body as Record<string, string>;
    const a = (await post(`/api/rooms/${host.code}/join`, { name: 'An' })).body as Record<string, string>;
    await post(`/api/rooms/${host.code}/start`, { hostToken: host.hostToken });
    let room = await roomOf(host.code!);
    // market settings survive validation (they used to be stripped by the quiz schema)
    expect(room.settings.decideSec).toBe(120);
    expect(room.deadline! - room.openedAt!).toBe(120_000);
    const deadline = room.deadline!;
    expect((await post(`/api/rooms/${host.code}/extend`, { hostToken: host.hostToken })).status).toBe(200);
    room = await roomOf(host.code!);
    expect(room.deadline).toBe(deadline + 60_000);
    clock = room.deadline! + 1;
    expect((await post(`/api/rooms/${host.code}/advance`, { expectStatus: 'decide', expectQuarter: 1 })).body.changed).toBe(true);
    room = await roomOf(host.code!);
    expect(room.standings[a.playerId!]!.defaulted).toBe(true);
    expect((await post(`/api/rooms/${host.code}/join`, { name: 'Muộn' })).status).toBe(409);
    expect((await post(`/api/rooms/${host.code}/end`, { hostToken: host.hostToken })).status).toBe(200);
    expect((await roomOf(host.code!)).status).toBe('finished');
  });
});
