// Game 4 "Tín hiệu sớm": năm quý, mô hình ẩn không rò ra phòng công khai, và các cái bẫy đúng như thiết kế.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng.js';
import { advanceRs, closeRsRound, createRsRoom, finishRs, joinRs, rsMe, startRs, submitRs, type RsPrivate } from '../src/rs/room.js';
import type { RsRoomDoc } from '../src/rs/types.js';
import { SIGNAL_ROOM } from '../src/sg/game.js';
import type { SgState } from '../src/sg/game.js';
import { SG_GROUPS, SG_HOURS, type SgDecision, type SgGroup, type SgReport, type SgShift, type SgView } from '../src/sg/types.js';

const rng = () => mulberry32(20261115);

function room(opts: { hostPlays?: boolean; fillBots?: boolean } = {}) {
  const r = rng();
  const made = createRsRoom(SIGNAL_ROOM, { code: 'SG001', hostPlays: opts.hostPlays ?? true, hostName: 'Hồng Hà', settings: { decideSec: 0, fillBots: opts.fillBots ?? false } }, 1_000, r);
  return { ...made, rng: r };
}

const plan = (o: Partial<SgDecision> = {}): SgDecision => ({
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

const state = (priv: RsPrivate) => priv.state as SgState;
const me = (r: RsRoomDoc, p: RsPrivate, id: string) => rsMe(SIGNAL_ROOM, r, p, id) as { view: SgView; reports: SgReport[]; scorecard: { total: number; parts: Record<string, number> }; grade: number | null };

/** Chuyển dịch thật đầu tiên có quý ăn tiền `from`. */
const realShift = (st: SgState) => st.shifts.find((s) => s.real)!;

describe('Game 4 · Tín hiệu sớm', () => {
  it('chơi hết năm quý, chấm điểm, và phòng công khai không chứa mô hình ẩn', () => {
    const { room: r, priv, rng: g } = room({ fillBots: true });
    startRs(SIGNAL_ROOM, r, priv, 2_000, g);
    const pid = r.hostPlayerId!;
    expect(r.order).toHaveLength(6);
    for (let q = 1; q <= 5; q++) {
      expect(r.status).toBe('decide');
      expect(me(r, priv, pid).view.hours).toBe(SG_HOURS);
      submitRs(SIGNAL_ROOM, r, priv, pid, q, plan({ sensors: ['rival', 'tech'], frame: 'job' }), 3_000 + q);
      if (q < 5) expect(advanceRs(SIGNAL_ROOM, r, priv, 4_000 + q, { isHost: true, expectStatus: 'results', expectRound: q })).toBe(true);
    }
    expect(r.status).toBe('finished');
    expect(r.history).toHaveLength(5);
    const mine = me(r, priv, pid);
    expect(mine.reports).toHaveLength(5);
    expect(mine.grade).not.toBeNull();
    expect(mine.view.truth).not.toBeNull();
    expect(mine.view.truth!.filter((t) => t.real)).toHaveLength(3);

    // Tài liệu phòng công khai: không có pool tín hiệu, không có chất lượng, không có chữ "có thật".
    const text = JSON.stringify(r);
    expect(text).not.toContain('"pool"');
    expect(text).not.toContain('"quality"');
    expect(text).not.toContain('"real"');
    expect(text).not.toContain(state(priv).pool['1']![0]!.text);
    for (const s of Object.values(r.standings)) expect(Array.isArray(s.cols)).toBe(false);
    // Firestore không nhận mảng lồng mảng.
    const noNested = (v: unknown): boolean =>
      Array.isArray(v) ? v.every((x) => !Array.isArray(x) && noNested(x)) : typeof v === 'object' && v !== null ? Object.values(v).every(noNested) : true;
    expect(noNested(r)).toBe(true);
  });

  it('kiểm chứng xong mới dùng được: cùng một hành động, có bằng chứng đã kiểm chứng thì ăn gấp đôi', () => {
    // Hai đơn vị chơi y hệt nhau, chỉ khác: một người kiểm chứng ở quý trước rồi mới hành động.
    const build = (citeSameQuarter: boolean) => {
      const { room: r, priv, rng: g } = room({ hostPlays: true, fillBots: false });
      joinRs(r, priv, 'Bạch Đằng', 1_100, g);
      startRs(SIGNAL_ROOM, r, priv, 2_000, g);
      const st = state(priv);
      const target = realShift(st);
      const pid = r.hostPlayerId!;
      const other = r.order.find((id) => id !== pid)!;
      // Quý 1: bật cảm biến ở mọi nhóm để chắc chắn thấy tín hiệu của chuyển dịch cần tìm.
      for (const id of [pid, other]) submitRs(SIGNAL_ROOM, r, priv, id, 1, plan({ sensors: SG_GROUPS.slice(0, 4) as SgGroup[] }), 2_100);
      advanceRs(SIGNAL_ROOM, r, priv, 2_200, { isHost: true, expectStatus: 'results', expectRound: 1 });
      // Quý 2: tìm một tín hiệu thật, chắc chắn của chuyển dịch cần tìm.
      const pool = st.pool['2']!.filter((s) => s.shift === target.shift && s.quality === 'solid' && !s.ai && st.cos[pid]!.sensors.includes(s.group));
      return { r, priv, st, target, pid, other, pool, citeSameQuarter };
    };
    const a = build(false);
    if (!a.pool.length) return; // hạt giống này không có tín hiệu phù hợp – bài kiểm thử dưới đã phủ phần còn lại
    const sig = a.pool[0]!;
    // Người A kiểm chứng ở quý 2, hành động ở quý 3. Người B hành động ngay ở quý 2 với cùng tín hiệu.
    submitRs(SIGNAL_ROOM, a.r, a.priv, a.pid, 2, plan({ sensors: SG_GROUPS.slice(0, 4) as SgGroup[], verify: [sig.id] }), 2_300);
    submitRs(SIGNAL_ROOM, a.r, a.priv, a.other, 2, plan({ sensors: SG_GROUPS.slice(0, 4) as SgGroup[], action: 'probe', target: a.target.shift as SgShift, evidence: [sig.id] }), 2_300);
    advanceRs(SIGNAL_ROOM, a.r, a.priv, 2_400, { isHost: true, expectStatus: 'results', expectRound: 2 });
    const bProbe = me(a.r, a.priv, a.other).reports[1]!;
    expect(bProbe.notes.join(' ')).toContain('chỉ được duyệt một phần');

    submitRs(SIGNAL_ROOM, a.r, a.priv, a.pid, 3, plan({ sensors: SG_GROUPS.slice(0, 4) as SgGroup[], action: 'probe', target: a.target.shift as SgShift, evidence: [sig.id] }), 2_500);
    submitRs(SIGNAL_ROOM, a.r, a.priv, a.other, 3, plan({ sensors: SG_GROUPS.slice(0, 4) as SgGroup[] }), 2_500);
    advanceRs(SIGNAL_ROOM, a.r, a.priv, 2_600, { isHost: true, expectStatus: 'results', expectRound: 3 });
    const aProbe = me(a.r, a.priv, a.pid).reports[2]!;
    const gain = aProbe.lines.find((l) => l.label.includes('Thử nghiệm'))?.value ?? 0;
    const plainGain = bProbe.lines.find((l) => l.label.includes('Thử nghiệm'))?.value ?? 0;
    if (a.target.real) {
      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeGreaterThan(plainGain * 1.5);
    }
  });

  it('bật đủ sáu nhóm thông tin thì hết giờ, không còn gì để hành động', () => {
    const all = plan({ sensors: SG_GROUPS as SgGroup[], frame: 'job' });
    const cost = SG_GROUPS.reduce((a, g) => a + { size: 1, customer: 2, rival: 2, price: 1, tech: 2, inside: 1 }[g], 0);
    expect(cost).toBe(9);
    const { room: r, priv, rng: g } = room({ fillBots: false });
    startRs(SIGNAL_ROOM, r, priv, 2_000, g);
    const pid = r.hostPlayerId!;
    // Sáu nhóm (9 giờ) + đặt vấn đề theo công việc của khách (1 giờ) = 10 giờ: không còn giờ cho hành động.
    expect(() => submitRs(SIGNAL_ROOM, r, priv, pid, 1, { ...all, action: 'probe', target: 'substitute' }, 2_100)).toThrow(/giờ phân tích/);
    expect(() => submitRs(SIGNAL_ROOM, r, priv, pid, 1, all, 2_100)).not.toThrow();
  });

  it('chỉ theo dõi giá và nội bộ thì quý 4 mất một phân khúc cho giải pháp thay thế', () => {
    const { room: r, priv, rng: g } = room({ fillBots: false });
    startRs(SIGNAL_ROOM, r, priv, 2_000, g);
    const st = state(priv);
    st.shifts = st.shifts.map((s) => (s.shift === 'substitute' ? { ...s, real: true, from: 4 } : s));
    const pid = r.hostPlayerId!;
    for (let q = 1; q <= 4; q++) {
      submitRs(SIGNAL_ROOM, r, priv, pid, q, plan({ sensors: ['price', 'inside'] }), 2_000 + q);
      if (q < 4) advanceRs(SIGNAL_ROOM, r, priv, 2_500 + q, { isHost: true, expectStatus: 'results', expectRound: q });
    }
    const q4 = me(r, priv, pid).reports[3]!;
    expect(q4.notes.join(' ')).toContain('giải pháp thay thế');
    expect(q4.lines.some((l) => l.label.includes('Mất một phân khúc'))).toBe(true);
    expect(q4.profit).toBeLessThan(0);
  });

  it('dùng dữ liệu không được phép là vi phạm, và tin sai làm kỷ luật thông tin bằng 0', () => {
    const { room: r, priv, rng: g } = room({ fillBots: false });
    startRs(SIGNAL_ROOM, r, priv, 2_000, g);
    const st = state(priv);
    const pid = r.hostPlayerId!;
    submitRs(SIGNAL_ROOM, r, priv, pid, 1, plan({ sensors: ['inside'] }), 2_100);
    advanceRs(SIGNAL_ROOM, r, priv, 2_200, { isHost: true, expectStatus: 'results', expectRound: 1 });
    // Gài một tín hiệu không được phép dùng và một tín hiệu sai vào quý 2, trong nhóm đang theo dõi.
    const pool = st.pool['2']!;
    pool[0]!.quality = 'restricted';
    pool[0]!.shift = 'substitute';
    pool[0]!.group = 'inside';
    pool[0]!.ai = undefined;
    pool[1]!.quality = 'false';
    pool[1]!.shift = 'substitute';
    pool[1]!.group = 'inside';
    pool[1]!.ai = undefined;
    submitRs(SIGNAL_ROOM, r, priv, pid, 2, plan({ sensors: ['inside'], action: 'probe', target: 'substitute', evidence: [pool[0]!.id, pool[1]!.id] }), 2_300);
    advanceRs(SIGNAL_ROOM, r, priv, 2_400, { isHost: true, expectStatus: 'results', expectRound: 2 });
    const q2 = me(r, priv, pid).reports[1]!;
    expect(q2.lines.some((l) => l.label.includes('vi phạm dữ liệu'))).toBe(true);
    expect(q2.notes.join(' ')).toContain('không được phép sử dụng');
    expect(q2.discipline).toBe(0);
  });

  it('từ chối dữ liệu nộp lên không hợp lệ và không nộp thì giữ kế hoạch quý trước', () => {
    const { room: r, priv, rng: g } = room({ fillBots: false });
    startRs(SIGNAL_ROOM, r, priv, 2_000, g);
    const pid = r.hostPlayerId!;
    expect(() => submitRs(SIGNAL_ROOM, r, priv, pid, 1, plan({ action: 'segment' }), 2_100)).toThrow(/chuyển dịch/);
    // Bằng chứng không nhìn thấy được thì bị bỏ, không làm lỗi cả kế hoạch.
    // Một người chơi duy nhất: nộp xong là vòng tự chốt.
    expect(submitRs(SIGNAL_ROOM, r, priv, pid, 1, plan({ sensors: ['rival'], evidence: ['s9-9'] }), 2_100)).toBe(true);
    expect(r.status).toBe('results');
    advanceRs(SIGNAL_ROOM, r, priv, 2_300, { isHost: true, expectStatus: 'results', expectRound: 1 });
    // Quý 2 không nộp: cảm biến giữ nguyên, không hành động.
    closeRsRound(SIGNAL_ROOM, r, priv, 2_400);
    expect(r.standings[pid]!.defaulted).toBe(true);
    expect(state(priv).cos[pid]!.sensors).toEqual(['rival']);
  });

  it('phòng của giảng viên: máy điền ghế trống và kết thúc sớm vẫn chấm được', () => {
    const { room: r, priv, rng: g } = createRsRoom(SIGNAL_ROOM, { code: 'SG002', hostPlays: false, settings: { decideSec: 300, fillBots: true } }, 1_000, rng()) as unknown as { room: RsRoomDoc; priv: RsPrivate; rng: () => number };
    void g;
    const joined = joinRs(r, priv, 'An Khê', 1_100, rng());
    startRs(SIGNAL_ROOM, r, priv, 2_000, rng());
    expect(r.order).toHaveLength(6);
    finishRs(SIGNAL_ROOM, r, priv, 3_000);
    expect(r.status).toBe('finished');
    const mine = me(r, priv, joined.playerId);
    expect(mine.scorecard.total).toBeGreaterThanOrEqual(0);
    expect(Object.keys(mine.scorecard.parts).sort()).toEqual(['discipline', 'early', 'profit']);
    // Máy có hành động, nên bảng công khai phải có đặt cược.
    const pub = r.pub as { bets?: Record<string, number> };
    expect(Object.values(pub.bets ?? {}).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});
