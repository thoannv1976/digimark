// Game 5 "Hành trình và niềm tin": năm quý, phễu vỡ ở khâu yếu nhất, và luật cứng về che giấu sự cố.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng.js';
import { advanceRs, closeRsRound, createRsRoom, finishRs, joinRs, rsMe, startRs, submitRs, type RsPrivate } from '../src/rs/room.js';
import type { RsRoomDoc } from '../src/rs/types.js';
import { JOURNEY_TRUST, type JtState } from '../src/jt/game.js';
import { JT_POINTS, JT_STAGES, type JtDecision, type JtReport, type JtStage, type JtView } from '../src/jt/types.js';

const rng = () => mulberry32(20261116);
const zero = () => Object.fromEntries(JT_STAGES.map((s) => [s, 0])) as Record<JtStage, number>;

function room(code = 'JT001', opts: { hostPlays?: boolean; fillBots?: boolean } = {}) {
  const r = rng();
  const made = createRsRoom(JOURNEY_TRUST, { code, hostPlays: opts.hostPlays ?? true, hostName: 'Phú Mỹ', settings: { decideSec: 0, fillBots: opts.fillBots ?? false } }, 1_000, r);
  return { ...made, rng: r };
}

const plan = (o: Partial<JtDecision> = {}): JtDecision => ({
  build: zero(),
  paid: 0,
  owned: 0,
  gov: 'fast',
  ai: 'direct',
  fixes: [],
  response: [],
  ...o,
});

const state = (priv: RsPrivate) => priv.state as JtState;
const me = (r: RsRoomDoc, p: RsPrivate, id: string) =>
  rsMe(JOURNEY_TRUST, r, p, id) as { view: JtView; reports: JtReport[]; scorecard: { total: number; parts: Record<string, number> }; grade: number | null; badges: string[] };

describe('Game 5 · Hành trình và niềm tin', () => {
  it('chơi hết năm quý, chấm điểm, và phòng công khai không chứa trọng số thật', () => {
    const { room: r, priv, rng: g } = room('JT001', { fillBots: true });
    startRs(JOURNEY_TRUST, r, priv, 2_000, g);
    const pid = r.hostPlayerId!;
    expect(r.order).toHaveLength(6);
    const build = zero();
    for (const s of JT_STAGES) build[s] = 1;
    for (let q = 1; q <= 5; q++) {
      expect(r.status).toBe('decide');
      expect(me(r, priv, pid).view.points).toBe(JT_POINTS);
      const open = me(r, priv, pid).view.open;
      submitRs(JOURNEY_TRUST, r, priv, pid, q, plan({ build, paid: q === 1 ? 3 : 0, owned: 2, gov: 'single', ...(open ? { response: ['verify', 'escalate', 'follow'] } : {}) }), 3_000 + q);
      if (q < 5) expect(advanceRs(JOURNEY_TRUST, r, priv, 4_000 + q, { isHost: true, expectStatus: 'results', expectRound: q })).toBe(true);
    }
    expect(r.status).toBe('finished');
    const mine = me(r, priv, pid);
    expect(mine.reports).toHaveLength(5);
    expect(mine.grade).not.toBeNull();
    expect(Object.keys(mine.scorecard.parts).sort()).toEqual(['brand', 'business', 'cx']);
    expect(mine.view.truth).not.toBeNull();
    // Bước Đánh giá là bước nặng nhất với khách hàng công nghiệp.
    const weights = mine.view.truth!.weights;
    expect(weights.reduce((a, b) => (b.weight > a.weight ? b : a)).stage).toBe('evaluate');

    const text = JSON.stringify(r);
    expect(text).not.toContain('"weights"');
    expect(text).not.toContain('"weight"');
    const noNested = (v: unknown): boolean =>
      Array.isArray(v) ? v.every((x) => !Array.isArray(x) && noNested(x)) : typeof v === 'object' && v !== null ? Object.values(v).every(noNested) : true;
    expect(noNested(r)).toBe(true);
  });

  it('phễu vỡ ở khâu yếu nhất: cùng số điểm, ai phủ đủ sáu giai đoạn thì ra nhiều hợp đồng hơn', () => {
    const { room: r, priv, rng: g } = room('JT002');
    joinRs(r, priv, 'Dung Quất', 1_100, g);
    startRs(JOURNEY_TRUST, r, priv, 2_000, g);
    const even = zero();
    for (const s of JT_STAGES) even[s] = 1; // 6 điểm, phủ đủ sáu giai đoạn
    const tall = { ...zero(), aware: 2, consider: 2 }; // cũng 6 điểm, nhưng bốn giai đoạn bỏ trống
    const a = r.hostPlayerId!;
    const b = r.order.find((id) => id !== a)!;
    submitRs(JOURNEY_TRUST, r, priv, a, 1, plan({ build: even, paid: 4 }), 2_100);
    submitRs(JOURNEY_TRUST, r, priv, b, 1, plan({ build: tall, paid: 4 }), 2_100);
    const ra = me(r, priv, a).reports[0]!;
    const rb = me(r, priv, b).reports[0]!;
    expect(ra.reach).toBeCloseTo(rb.reach, 5);
    expect(ra.contracts).toBeGreaterThan(rb.contracts * 3);
    // Giai đoạn bỏ trống rơi gần hết.
    expect(rb.stages.find((s) => s.stage === 'evaluate')!.pass).toBeLessThan(0.3);
  });

  it('Paid cho tiếp cận ngay, Owned chỉ cho tiếp cận từ quý sau nhưng không mất đi', () => {
    const { room: r, priv, rng: g } = room('JT003');
    startRs(JOURNEY_TRUST, r, priv, 2_000, g);
    const pid = r.hostPlayerId!;
    submitRs(JOURNEY_TRUST, r, priv, pid, 1, plan({ owned: 6 }), 2_100);
    const q1 = me(r, priv, pid).reports[0]!;
    expect(q1.reach).toBe(0);
    expect(q1.ownedStock).toBe(6);
    advanceRs(JOURNEY_TRUST, r, priv, 2_200, { isHost: true, expectStatus: 'results', expectRound: 1 });
    // Quý 2 không chi thêm một đồng nào: tài sản Owned vẫn kéo khách về.
    submitRs(JOURNEY_TRUST, r, priv, pid, 2, plan(), 2_300);
    const q2 = me(r, priv, pid).reports[1]!;
    expect(q2.reach).toBeGreaterThan(0);
    expect(q2.ownedStock).toBeLessThan(6);
  });

  it('sự cố an toàn, môi trường hoặc bảo mật: không chuyển cấp là che giấu, và điểm thương hiệu bị chặn trần', () => {
    const openOn = (code: string, response: JtDecision['response']) => {
      const { room: r, priv, rng: g } = room(code);
      startRs(JOURNEY_TRUST, r, priv, 2_000, g);
      const pid = r.hostPlayerId!;
      const build = zero();
      for (const s of JT_STAGES) build[s] = 1;
      submitRs(JOURNEY_TRUST, r, priv, pid, 1, plan({ build, paid: 3, gov: 'single' }), 2_100);
      advanceRs(JOURNEY_TRUST, r, priv, 2_200, { isHost: true, expectStatus: 'results', expectRound: 1 });
      // Gài một sự cố rò rỉ dữ liệu đang mở.
      state(priv).cos[pid]!.open = { risk: 'leak', round: 1 };
      state(priv).cos[pid]!.incidents = [{ risk: 'leak', round: 1 }];
      submitRs(JOURNEY_TRUST, r, priv, pid, 2, plan({ build, paid: 3, gov: 'single', response }), 2_300);
      return { r, priv, pid, report: me(r, priv, pid).reports[1]!, view: me(r, priv, pid).view, score: me(r, priv, pid).scorecard };
    };
    const hidden = openOn('JT004', ['delete', 'respond', 'detect']);
    const proper = openOn('JT005', ['verify', 'escalate', 'follow']);
    expect(hidden.view.concealed).toBe(true);
    expect(proper.view.concealed).toBe(false);
    expect(hidden.report.resolved!.damage!).toBeGreaterThan(proper.report.resolved!.damage! * 3);
    expect(hidden.report.notes.join(' ')).toContain('che giấu sự thật');
    expect(hidden.score.parts.brand!).toBeLessThan(proper.score.parts.brand!);
  });

  it('phản hồi trước khi xác minh làm thiệt hại tăng', () => {
    const run = (response: JtDecision['response']) => {
      const { room: r, priv, rng: g } = room('JT006');
      startRs(JOURNEY_TRUST, r, priv, 2_000, g);
      const pid = r.hostPlayerId!;
      submitRs(JOURNEY_TRUST, r, priv, pid, 1, plan({ paid: 2 }), 2_100);
      advanceRs(JOURNEY_TRUST, r, priv, 2_200, { isHost: true, expectStatus: 'results', expectRound: 1 });
      state(priv).cos[pid]!.open = { risk: 'wrong', round: 1 };
      state(priv).cos[pid]!.incidents = [{ risk: 'wrong', round: 1 }];
      submitRs(JOURNEY_TRUST, r, priv, pid, 2, plan({ paid: 2, response }), 2_300);
      return me(r, priv, pid).reports[1]!.resolved!;
    };
    const rushed = run(['respond', 'detect', 'classify']);
    const careful = run(['verify', 'respond', 'follow']);
    expect(rushed.damage!).toBeGreaterThan(careful.damage!);
    expect(rushed.verdict).toContain('phản hồi trước khi xác minh');
  });

  it('không hạ cấp điểm chạm, không vượt điểm nguồn lực, không nộp thì giữ nguyên kế hoạch', () => {
    const { room: r, priv, rng: g } = room('JT007');
    startRs(JOURNEY_TRUST, r, priv, 2_000, g);
    const pid = r.hostPlayerId!;
    const build = zero();
    for (const s of JT_STAGES) build[s] = 2; // 6 × (1+2) = 18 điểm
    expect(() => submitRs(JOURNEY_TRUST, r, priv, pid, 1, plan({ build }), 2_100)).toThrow(/điểm nguồn lực/);
    const one = zero();
    for (const s of JT_STAGES) one[s] = 1;
    submitRs(JOURNEY_TRUST, r, priv, pid, 1, plan({ build: one, paid: 4, gov: 'single' }), 2_100);
    advanceRs(JOURNEY_TRUST, r, priv, 2_200, { isHost: true, expectStatus: 'results', expectRound: 1 });
    expect(() => submitRs(JOURNEY_TRUST, r, priv, pid, 2, plan({ build: zero() }), 2_300)).toThrow(/hạ cấp/);
    closeRsRound(JOURNEY_TRUST, r, priv, 2_400);
    expect(r.standings[pid]!.defaulted).toBe(true);
    expect(state(priv).cos[pid]!.build.evaluate).toBe(1);
    expect(state(priv).cos[pid]!.gov).toBe('single');
  });

  it('phòng của giảng viên: máy điền ghế trống, kết thúc sớm vẫn ra bảng xếp hạng', () => {
    const { room: r, priv } = createRsRoom(JOURNEY_TRUST, { code: 'JT008', hostPlays: false, settings: { decideSec: 300, fillBots: true } }, 1_000, rng());
    const joined = joinRs(r, priv, 'Cà Mau', 1_100, rng());
    startRs(JOURNEY_TRUST, r, priv, 2_000, rng());
    expect(r.order).toHaveLength(6);
    finishRs(JOURNEY_TRUST, r, priv, 3_000);
    expect(r.status).toBe('finished');
    expect(Object.keys(r.standings)).toHaveLength(6);
    const mine = me(r, priv, joined.playerId);
    expect(mine.scorecard.total).toBeGreaterThanOrEqual(0);
    // Máy "giấu sự cố" bị gắn nhãn khi nó thực sự che giấu một sự cố.
    const flags = Object.values(r.standings).map((s) => s.flag);
    expect(flags.every((f) => f === undefined || f === 'concealed')).toBe(true);
    const pub = r.pub as { incidents?: number };
    expect(typeof pub.incidents).toBe('number');
  });
});
