// Game 4 và Game 5 qua API, chạy với giả lập Firestore.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import type { JtDecision, JtStage, JtView, RsMe, RsRoomDoc, SgDecision, SgReport, SgView, JtReport } from '@arena/engine';
import { JT_STAGES } from '@arena/engine';
import { buildApp } from '../src/app.js';
import { openFirestore } from '../src/firestore.js';

const HUB = 'https://hub.test';
const SECRET = 'test-secret-rs-0123456789';
const db = openFirestore('demo-arena', '(default)');
let app: FastifyInstance;
let privateKey: CryptoKey;
const sent: Array<Record<string, unknown>> = [];
let clock = 1_806_900_000_000;

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
const roomOf = async (code: string) => (await db.doc(`rooms/${code}`).get()).data() as RsRoomDoc;

async function ticket(activity: string, gradeTarget: string, sub: string) {
  return new SignJWT({
    ugh: {
      tenantId: 'aiedu2026',
      platform: { issuer: 'https://aiedu2026.com', deploymentId: '9' },
      ltiSub: sub,
      name: 'Lê Thu',
      role: 'learner',
      context: { id: '70', title: 'DIGIMARK-PVN' },
      resourceLink: { id: `rl-${activity}` },
      activity,
      gradeTarget,
      launchId: 'l',
    },
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'unigamehub-launch+jwt', kid: 'k1' })
    .setIssuer(HUB)
    .setAudience('digimark')
    .setSubject(`hub-user-${sub}`)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(privateKey);
}

const sgPlan = (o: Partial<SgDecision> = {}): SgDecision => ({
  question: 'growth',
  sensors: [],
  verify: [],
  aiDigest: false,
  frame: 'product',
  action: 'none',
  target: null,
  evidence: [],
  watch: null,
  ...o,
});
const zeroBuild = () => Object.fromEntries(JT_STAGES.map((s) => [s, 0])) as Record<JtStage, number>;
const jtPlan = (o: Partial<JtDecision> = {}): JtDecision => ({ build: zeroBuild(), paid: 0, owned: 0, gov: 'fast', ai: 'direct', fixes: [], response: [], ...o });

describe('Game 4 · Tín hiệu sớm qua API', () => {
  it('chơi một trận từ Moodle và điểm về tới Hub', async () => {
    const launch = (await post('/api/lti/launch', { ticket: await ticket('signal-room', 'gt-sg', 'u-sg') })).body;
    expect(launch.activity).toBe('signal-room');
    const created = await post('/api/rooms', { game: 'signal-room', hostPlays: true, ltiSession: launch.session, settings: { decideSec: 0 } });
    expect(created.status).toBe(200);
    const { code, hostToken, playerId, playerToken } = created.body as Record<string, string>;
    // Cài đặt của game nhiều vòng không bị lược đi bởi schema của game đố.
    expect((await roomOf(code!)).settings.decideSec).toBe(0);
    // Route của game đố từ chối phòng này.
    expect((await post(`/api/rooms/${code}/answer`, { playerId, playerToken, qIndex: 0, input: { kind: 'choice', option: 0 } })).status).toBe(409);
    expect((await post(`/api/rooms/${code}/start`, { hostToken })).status).toBe(200);
    for (let q = 1; q <= 5; q++) {
      expect((await roomOf(code!)).status).toBe('decide');
      const me = (await post(`/api/rooms/${code}/rs-me`, { playerId, playerToken })).body as unknown as RsMe<SgReport, SgView>;
      expect(me.view.hours).toBe(10);
      // Vượt giờ phân tích thì bị từ chối.
      const over = await post(`/api/rooms/${code}/rs-decide`, {
        playerId,
        playerToken,
        round: q,
        decision: sgPlan({ sensors: ['size', 'customer', 'rival', 'price', 'tech', 'inside'], frame: 'job', action: 'segment', target: 'substitute' }),
      });
      expect(over.status).toBe(400);
      const ok = await post(`/api/rooms/${code}/rs-decide`, { playerId, playerToken, round: q, decision: sgPlan({ sensors: ['rival', 'tech'], frame: 'job' }) });
      expect(ok.body).toMatchObject({ ok: true, closed: true });
      const after = (await post(`/api/rooms/${code}/rs-me`, { playerId, playerToken })).body as unknown as RsMe<SgReport, SgView>;
      expect(after.reports).toHaveLength(q);
      clock += 1000;
      if (q < 5) expect((await post(`/api/rooms/${code}/advance`, { hostToken, expectStatus: 'results', expectQuarter: q })).body.changed).toBe(true);
    }
    const room = await roomOf(code!);
    expect(room.status).toBe('finished');
    expect(room.lmsStatus?.[playerId!]).toBe('sent');
    const mine = sent.find((x) => x.attempt_id === `${code}:${playerId}`)!;
    expect(mine.grade_target).toBe('gt-sg');
    expect(String(mine.comment)).toContain('Tín hiệu sớm');
    // Mô hình ẩn ở lại máy chủ: phòng công khai không có pool tín hiệu.
    expect(JSON.stringify(room)).not.toContain('"pool"');
    const end = (await post(`/api/rooms/${code}/rs-me`, { playerId, playerToken })).body as unknown as RsMe<SgReport, SgView>;
    expect(end.view.truth).not.toBeNull();
    expect(end.view.truth!.filter((t) => t.real)).toHaveLength(3);
  });

  it('phòng giảng viên: đồng hồ, gia hạn, không nộp thì giữ kế hoạch, kết thúc sớm', async () => {
    const host = (await post('/api/rooms', { game: 'signal-room', hostPlays: false, settings: { decideSec: 120, fillBots: true } })).body as Record<string, string>;
    const a = (await post(`/api/rooms/${host.code}/join`, { name: 'An' })).body as Record<string, string>;
    await post(`/api/rooms/${host.code}/start`, { hostToken: host.hostToken });
    let room = await roomOf(host.code!);
    expect(room.order).toHaveLength(6);
    expect(room.deadline! - room.openedAt!).toBe(120_000);
    const deadline = room.deadline!;
    expect((await post(`/api/rooms/${host.code}/extend`, { hostToken: host.hostToken })).status).toBe(200);
    expect((await roomOf(host.code!)).deadline).toBe(deadline + 60_000);
    clock = (await roomOf(host.code!)).deadline! + 1;
    expect((await post(`/api/rooms/${host.code}/advance`, { expectStatus: 'decide', expectQuarter: 1 })).body.changed).toBe(true);
    room = await roomOf(host.code!);
    expect(room.standings[a.playerId!]!.defaulted).toBe(true);
    expect((await post(`/api/rooms/${host.code}/join`, { name: 'Muộn' })).status).toBe(409);
    // Quý 1 là quý đặt cảm biến: bảng công khai đã nói mấy đơn vị theo dõi nhóm nào, chưa ai đặt cược.
    const pub1 = room.pub as { bets?: Record<string, number>; watchers?: Record<string, number> };
    expect(Object.values(pub1.watchers ?? {}).reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    expect((await post(`/api/rooms/${host.code}/end`, { hostToken: host.hostToken })).status).toBe(200);
    const done = await roomOf(host.code!);
    expect(done.status).toBe('finished');
    // Chơi hết trận thì máy đã đặt cược, và bảng công khai nói mức độ đông mà không nói ai.
    const pub = done.pub as { bets?: Record<string, number> };
    expect(Object.values(pub.bets ?? {}).reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
  });
});

describe('Game 5 · Hành trình và niềm tin qua API', () => {
  it('chơi một trận từ Moodle và điểm về tới Hub', async () => {
    const launch = (await post('/api/lti/launch', { ticket: await ticket('journey-trust', 'gt-jt', 'u-jt') })).body;
    expect(launch.activity).toBe('journey-trust');
    const created = await post('/api/rooms', { game: 'journey-trust', hostPlays: true, ltiSession: launch.session, settings: { decideSec: 0 } });
    const { code, hostToken, playerId, playerToken } = created.body as Record<string, string>;
    expect((await post(`/api/rooms/${code}/start`, { hostToken })).status).toBe(200);
    const build = zeroBuild();
    for (const s of JT_STAGES) build[s] = 1;
    for (let q = 1; q <= 5; q++) {
      const me = (await post(`/api/rooms/${code}/rs-me`, { playerId, playerToken })).body as unknown as RsMe<JtReport, JtView>;
      expect(me.view.points).toBe(12);
      // Không thể hạ cấp điểm chạm đã xây.
      if (q > 1) {
        const down = await post(`/api/rooms/${code}/rs-decide`, { playerId, playerToken, round: q, decision: jtPlan({ build: zeroBuild() }) });
        expect(down.status).toBe(400);
      }
      const response = me.view.open ? (['verify', 'escalate', 'follow'] as JtDecision['response']) : [];
      const ok = await post(`/api/rooms/${code}/rs-decide`, { playerId, playerToken, round: q, decision: jtPlan({ build, paid: q === 1 ? 2 : 3, owned: q === 1 ? 1 : 2, gov: 'single', ai: 'review', response }) });
      expect(ok.body).toMatchObject({ ok: true, closed: true });
      clock += 1000;
      if (q < 5) expect((await post(`/api/rooms/${code}/advance`, { hostToken, expectStatus: 'results', expectQuarter: q })).body.changed).toBe(true);
    }
    const room = await roomOf(code!);
    expect(room.status).toBe('finished');
    expect(room.lmsStatus?.[playerId!]).toBe('sent');
    const mine = sent.find((x) => x.attempt_id === `${code}:${playerId}`)!;
    expect(mine.grade_target).toBe('gt-jt');
    expect(String(mine.comment)).toContain('Hành trình và niềm tin');
    // Trọng số thật của sáu giai đoạn chỉ hiện ở màn hình cuối của từng người.
    expect(JSON.stringify(room)).not.toContain('"weights"');
    const end = (await post(`/api/rooms/${code}/rs-me`, { playerId, playerToken })).body as unknown as RsMe<JtReport, JtView>;
    expect(end.view.truth!.weights).toHaveLength(6);
  });

  it('phòng giảng viên: máy điền ghế trống và bảng công khai đếm sự cố', async () => {
    const host = (await post('/api/rooms', { game: 'journey-trust', hostPlays: false, settings: { decideSec: 300, fillBots: true } })).body as Record<string, string>;
    await post(`/api/rooms/${host.code}/join`, { name: 'Bình' });
    await post(`/api/rooms/${host.code}/start`, { hostToken: host.hostToken });
    expect((await roomOf(host.code!)).order).toHaveLength(6);
    expect((await post(`/api/rooms/${host.code}/end`, { hostToken: host.hostToken })).status).toBe(200);
    const room = await roomOf(host.code!);
    expect(room.status).toBe('finished');
    const pub = room.pub as { incidents?: number; cx?: number };
    expect(typeof pub.incidents).toBe('number');
    expect(pub.cx).toBeGreaterThan(0);
    // Máy chơi khác nhau nên thứ hạng phải phân hóa.
    const scores = Object.values(room.standings).map((s) => s.score);
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(5);
  });
});
