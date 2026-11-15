// Game 5 "Hành trình và niềm tin" – mô hình ẩn. CHỈ chạy ở máy chủ: file này biết trọng số thật của
// sáu giai đoạn, bộ ba bước đúng cho từng loại sự cố và lượt rút sự cố. Trình duyệt chỉ nhập jt/types.ts.
import { GameError } from '../room.js';
import type { Rng } from '../rng.js';
import type { RsGame, RsInput, RsRoundOut } from '../rs/room.js';
import type { RsRoomDoc, RsScorecard } from '../rs/types.js';
import type { BotLevel } from '../types.js';
import {
  JT_AI_INFO,
  JT_AIS,
  JT_BAD_MOVE,
  JT_BAD_SCAR,
  JT_CONCEAL,
  JT_CONCEAL_CAP,
  JT_CONTRACT,
  JT_EARNED,
  JT_FIXES,
  JT_FIX_COST,
  JT_FIX_CX,
  JT_FIX_HELP,
  JT_FIX_INFO,
  JT_HOLE,
  JT_GOVS,
  JT_GOV_INFO,
  JT_MAX_LEVEL,
  JT_MAX_OWNED,
  JT_MAX_PAID,
  JT_MAX_STEPS,
  JT_OWNED_KEEP,
  JT_OWNED_REACH,
  JT_PAID_REACH,
  JT_PAID_RISK,
  JT_POINTS,
  JT_POOL,
  JT_RENEW,
  JT_RESPOND_FIRST,
  JT_REV_TARGET,
  JT_RISKS,
  JT_RISK_BASE,
  JT_RISK_INFO,
  JT_ROUNDS,
  JT_STAGES,
  JT_STAGE_COST,
  JT_STAGE_INFO,
  JT_STEPS,
  JT_STEP_CUT,
  JT_STEP_INFO,
  type JtAi,
  type JtDecision,
  type JtFix,
  type JtGov,
  type JtIncident,
  type JtPub,
  type JtReport,
  type JtRisk,
  type JtStage,
  type JtStageLine,
  type JtStep,
  type JtView,
} from './types.js';

// ───────────────────────── mô hình ẩn ─────────────────────────

/**
 * Trọng số thật của sáu giai đoạn với nhóm khách hàng công nghiệp mua khí/LNG.
 * Bước Đánh giá nặng nhất: họ cần hồ sơ, tiêu chuẩn và số liệu kiểm chứng. Học viên KHÔNG thấy bảng này,
 * chỉ suy ra từ tỷ lệ đi tiếp của từng giai đoạn trong báo cáo quý trước.
 */
const WEIGHT: Record<JtStage, number> = { aware: 0.12, consider: 0.15, evaluate: 0.28, buy: 0.15, use: 0.15, loyal: 0.15 };

/** Bộ ba bước đúng cho từng loại sự cố (ẩn): quy trình 6 bước, nhưng 60 phút đầu chỉ đủ cho ba. */
const RIGHT: Record<JtRisk, JtStep[]> = {
  wrong: ['verify', 'respond', 'follow'],
  crisis: ['detect', 'verify', 'escalate'],
  leak: ['verify', 'escalate', 'follow'],
  fake: ['detect', 'escalate', 'respond'],
  aicontent: ['verify', 'escalate', 'follow'],
  reply: ['classify', 'escalate', 'respond'],
  channels: ['detect', 'classify', 'escalate'],
};

const GOV_IDX: Record<JtGov, number> = { fast: 0.1, single: 0.6, full: 1 };
const AI_IDX: Record<JtAi, number> = { direct: 0.2, review: 0.7, approve: 1 };

export interface JtCo {
  build: Record<JtStage, number>;
  ownedStock: number;
  fixes: JtFix[];
  gov: JtGov;
  ai: JtAi;
  revenueCum: number;
  keptLast: number;
  cx: number;
  trust: number;
  open: JtIncident | null;
  incidents: JtIncident[];
  concealed: boolean;
  brand: number[];
  cxLog: number[];
  badMoves: number;
  paidOnly: boolean;
}

export interface JtState {
  cos: Record<string, JtCo>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const zeroBuild = (): Record<JtStage, number> => Object.fromEntries(JT_STAGES.map((s) => [s, 0])) as Record<JtStage, number>;

function newCo(): JtCo {
  return {
    build: zeroBuild(),
    ownedStock: 0,
    fixes: [],
    gov: 'fast',
    ai: 'direct',
    revenueCum: 0,
    keptLast: 0,
    cx: 0.1,
    trust: 0.3,
    open: null,
    incidents: [],
    concealed: false,
    brand: [],
    cxLog: [],
    badMoves: 0,
    paidOnly: true,
  };
}

function initJt(order: string[], _room: RsRoomDoc, _rng: Rng): JtState {
  return { cos: Object.fromEntries(order.map((id) => [id, newCo()])) };
}

// ───────────────────────── kiểm tra dữ liệu nộp lên ─────────────────────────

/** Điểm nguồn lực mà một kế hoạch cần, tính từ cấp điểm chạm hiện có. */
export function jtSpent(d: JtDecision, have: Record<JtStage, number>, fixes: JtFix[]): number {
  let n = 0;
  for (const s of JT_STAGES) {
    for (let lv = (have[s] ?? 0) + 1; lv <= (d.build[s] ?? 0); lv++) n += JT_STAGE_COST[lv - 1] ?? 0;
  }
  n += d.paid + d.owned;
  n += JT_GOV_INFO[d.gov].cost + JT_AI_INFO[d.ai].cost;
  n += d.fixes.filter((f) => !fixes.includes(f)).length * JT_FIX_COST;
  return n;
}

function validateJt(raw: unknown, _round: number, st: JtState, playerId: string): JtDecision {
  const o = (raw ?? {}) as Partial<JtDecision>;
  const co = st.cos[playerId];
  if (!co) throw new GameError('no_player', 'Không có đơn vị này trong phòng.', 404);
  const build = zeroBuild();
  for (const s of JT_STAGES) {
    const want = Math.round(Number((o.build as Record<string, number> | undefined)?.[s] ?? co.build[s]));
    const lv = Number.isFinite(want) ? Math.min(JT_MAX_LEVEL, Math.max(0, want)) : co.build[s];
    if (lv < co.build[s]) throw new GameError('no_downgrade', `Không thể hạ cấp điểm chạm ở giai đoạn ${JT_STAGE_INFO[s].name}.`, 400);
    build[s] = lv;
  }
  const int = (v: unknown, hi: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(0, n)) : 0;
  };
  const gov: JtGov = JT_GOVS.includes(o.gov as JtGov) ? (o.gov as JtGov) : co.gov;
  const ai: JtAi = JT_AIS.includes(o.ai as JtAi) ? (o.ai as JtAi) : co.ai;
  const fixes = [...new Set([...co.fixes, ...JT_FIXES.filter((f) => Array.isArray(o.fixes) && (o.fixes as string[]).includes(f))])];
  const response = co.open
    ? [...new Set(Array.isArray(o.response) ? (o.response as string[]) : [])].filter((s): s is JtStep => (JT_STEPS as string[]).includes(s)).slice(0, JT_MAX_STEPS)
    : [];
  const d: JtDecision = { build, paid: int(o.paid, JT_MAX_PAID), owned: int(o.owned, JT_MAX_OWNED), gov, ai, fixes, response };
  const spent = jtSpent(d, co.build, co.fixes);
  if (spent > JT_POINTS) throw new GameError('over_points', `Kế hoạch cần ${spent} điểm nguồn lực, chỉ có ${JT_POINTS}.`, 400);
  return d;
}

function fallbackJt(st: JtState, playerId: string, _round: number, last: JtDecision | undefined): JtDecision {
  // Không nộp: giữ nguyên mọi thứ của quý trước, và sự cố đang mở thì không được xử lý.
  const co = st.cos[playerId]!;
  return {
    build: { ...co.build },
    paid: last?.paid ?? 0,
    owned: last?.owned ?? 0,
    gov: co.gov,
    ai: co.ai,
    fixes: [...co.fixes],
    response: [],
  };
}

// ───────────────────────── mô phỏng một quý ─────────────────────────

function cxOf(co: JtCo, build: Record<JtStage, number>, fixes: JtFix[], gov: JtGov): number {
  void co;
  const base = 0.1 + JT_FIX_CX * fixes.length + 0.12 * (build.use / JT_MAX_LEVEL) + 0.12 * (build.loyal / JT_MAX_LEVEL) + (gov === 'full' ? 0.06 : 0);
  return clamp01(base);
}

function trustOf(cx: number, build: Record<JtStage, number>, gov: JtGov, ai: JtAi): number {
  const min = Math.min(...JT_STAGES.map((s) => build[s]));
  return clamp01(0.25 + 0.2 * GOV_IDX[gov] + 0.15 * AI_IDX[ai] + 0.3 * cx + 0.1 * (min / JT_MAX_LEVEL));
}

function resolve(inc: JtIncident, steps: JtStep[], gov: JtGov): { damage: number; verdict: string; concealed: boolean; quality: number } {
  const info = JT_RISK_INFO[inc.risk];
  const right = RIGHT[inc.risk];
  const correct = steps.filter((s) => right.includes(s)).length;
  const bad = steps.filter((s) => JT_STEP_INFO[s].bad).length;
  let damage = info.damage * JT_GOV_INFO[gov].severity;
  damage *= 1 - JT_STEP_CUT * correct;
  const parts: string[] = [];
  if (correct > 0) parts.push(`${correct}/3 bước đúng`);
  else parts.push('không có bước nào đúng');
  if (steps.includes('respond') && !steps.includes('verify')) {
    damage *= JT_RESPOND_FIRST;
    parts.push('phản hồi trước khi xác minh');
  }
  if (bad > 0) {
    damage *= JT_BAD_MOVE ** bad;
    parts.push(bad === 2 ? 'hai nước đi làm xấu hơn' : 'một nước đi làm xấu hơn');
  }
  let concealed = false;
  if (info.hard && (!steps.includes('escalate') || bad > 0)) {
    damage *= JT_CONCEAL;
    concealed = true;
    parts.push('sự cố an toàn, môi trường hoặc bảo mật mà không chuyển cấp đúng thẩm quyền');
  }
  if (!steps.length) parts.push('không xử lý gì');
  return { damage: r2(damage), verdict: parts.join(' · '), concealed, quality: clamp01(correct / 3 - 0.3 * bad) };
}

function simulateJt(st: JtState, order: string[], inputs: Record<string, RsInput<JtDecision>>, round: number, rng: Rng): RsRoundOut<JtReport> {
  const reports: Record<string, JtReport> = {};
  const values: Record<string, number> = {};
  const news: string[] = [];
  let newIncidents = 0;
  let concealedNow = 0;
  let paidHeavy = 0;

  for (const id of order) {
    const co = st.cos[id]!;
    const d = inputs[id]!.decision;
    const notes: string[] = [];

    // Sự cố của quý trước được xử lý ngay đầu quý này – "60 phút đầu tiên".
    let resolved: JtIncident | null = null;
    let damage = 0;
    let handleQuality = 1;
    if (co.open) {
      const out = resolve(co.open, d.response, d.gov);
      damage = out.damage;
      handleQuality = out.quality;
      if (out.concealed) {
        co.concealed = true;
        concealedNow++;
      }
      resolved = { ...co.open, handled: true, steps: d.response, damage: out.damage, verdict: out.verdict };
      co.incidents = co.incidents.map((x) => (x.round === resolved!.round ? resolved! : x));
      co.open = null;
      notes.push(`Sự cố “${JT_RISK_INFO[resolved.risk].name}”: ${out.verdict}. Thiệt hại ${out.damage.toFixed(2).replace('.', ',')} tỷ.`);
      if (out.concealed) notes.push('Không được ưu tiên bảo vệ hình ảnh thương hiệu bằng cách che giấu sự thật hoặc trì hoãn nghĩa vụ thông báo. Điểm thương hiệu bị chặn trần từ đây.');
      co.badMoves += d.response.filter((s) => JT_STEP_INFO[s].bad).length;
    }

    // Tiếp cận: Paid tính ngay trong quý, Owned tính từ tài sản đã tích lũy, Earned nhân hệ số.
    const earnedMul = 1 + JT_EARNED * co.cx * co.trust;
    const reach = (JT_PAID_REACH * d.paid + JT_OWNED_REACH * co.ownedStock) * JT_GOV_INFO[d.gov].reach * JT_AI_INFO[d.ai].content * earnedMul;
    if (d.paid >= 5) paidHeavy++;
    if (d.owned > 0) co.paidOnly = false;

    // Phễu: khách rơi ở giai đoạn yếu nhất, và trọng số thật của giai đoạn quyết định rơi bao nhiêu.
    const stages: JtStageLine[] = [];
    let flow = reach * JT_POOL;
    let contracts = 0;
    for (const s of JT_STAGES) {
      const level = d.build[s];
      const help = d.fixes.filter((f) => JT_FIX_INFO[f].helps.includes(s)).length;
      const loss = clamp01(3 * WEIGHT[s] * (1 - level / JT_MAX_LEVEL) * (1 - JT_FIX_HELP) ** help);
      const pass = (1 - loss) * (level === 0 ? JT_HOLE : 1);
      const out = flow * pass;
      stages.push({ stage: s, level, inFlow: Math.round(flow * 10) / 10, pass: r3(pass), lost: Math.round((flow - out) * 10) / 10 });
      flow = out;
      if (s === 'buy') contracts = flow;
    }
    const kept = flow;

    const revenue = r2(contracts * JT_CONTRACT + co.keptLast * JT_RENEW - damage);
    co.revenueCum = r2(co.revenueCum + revenue);
    co.keptLast = kept;

    // Trải nghiệm và niềm tin được tính lại sau khi kế hoạch của quý đã chạy.
    co.build = { ...d.build };
    co.fixes = [...d.fixes];
    co.gov = d.gov;
    co.ai = d.ai;
    co.ownedStock = r2(co.ownedStock * JT_OWNED_KEEP + d.owned);
    const cx = cxOf(co, co.build, co.fixes, co.gov);
    co.cx = cx;
    co.trust = trustOf(cx, co.build, co.gov, co.ai);
    co.cxLog.push(cx);

    // Thương hiệu và quản trị rủi ro của quý.
    const minL = Math.min(...JT_STAGES.map((s) => co.build[s]));
    const avgL = JT_STAGES.reduce((a, s) => a + co.build[s], 0) / JT_STAGES.length;
    let brand = 0.4 * (minL / JT_MAX_LEVEL) + 0.25 * (avgL / JT_MAX_LEVEL) + 0.15 * AI_IDX[co.ai] + 0.15 * GOV_IDX[co.gov] + 0.05 * cx;
    if (resolved) brand *= 0.4 + 0.6 * handleQuality;
    // Nước đi làm xấu hơn để lại vết: thương hiệu là thứ tích lũy, không phải việc của một quý.
    if (co.badMoves > 0) brand *= Math.max(0.2, 1 - JT_BAD_SCAR * co.badMoves);
    if (co.concealed) brand = Math.min(brand, JT_CONCEAL_CAP);
    co.brand.push(clamp01(brand));

    // Sự cố mới: xác suất do cơ chế phê duyệt, mức kiểm soát nội dung AI và độ phủ kênh quyết định.
    let opened: JtIncident | null = null;
    if (round < JT_ROUNDS) {
      const p = clamp01(JT_RISK_BASE * JT_GOV_INFO[co.gov].risk + JT_AI_INFO[co.ai].risk + (d.paid >= 5 ? JT_PAID_RISK : 0));
      if (rng() < p) {
        const pool = co.ai === 'direct' ? JT_RISKS : JT_RISKS.filter((r) => r !== 'aicontent');
        const risk = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
        opened = { risk, round };
        co.open = opened;
        co.incidents.push(opened);
        newIncidents++;
        notes.push(`Sự cố mới: ${JT_RISK_INFO[risk].name}. Phải xử lý ngay đầu quý sau, và chỉ kịp ba bước.`);
      }
    }

    const cxRows = [
      { key: 'csat', value: Math.round((0.5 + 0.5 * cx) * 100) },
      { key: 'nps', value: Math.round((cx * 80 - 20) * 10) / 10 },
      { key: 'ces', value: Math.round((0.4 + 0.6 * cx) * 100) },
      { key: 'response', value: Math.round((1 - cx) * 48 + 2) },
      { key: 'retention', value: Math.round(clamp01(0.45 + 0.5 * cx) * 100) },
    ];

    values[id] = co.revenueCum;
    reports[id] = {
      round,
      reach: r2(reach),
      ownedStock: co.ownedStock,
      earnedMul: r3(earnedMul),
      stages,
      contracts: Math.round(contracts * 10) / 10,
      kept: Math.round(kept * 10) / 10,
      revenue,
      revenueCum: co.revenueCum,
      cx: r3(cx),
      cxRows,
      trust: r3(co.trust),
      resolved,
      opened,
      notes,
    };
  }

  if (newIncidents > 0) news.push(`${newIncidents} sự cố truyền thông nổ trong quý này, phải xử lý ở quý sau.`);
  if (concealedNow > 0) news.push(`${concealedNow} đơn vị xử lý một sự cố an toàn, môi trường hoặc bảo mật mà không chuyển cấp đúng thẩm quyền.`);
  if (paidHeavy > 0) news.push(`${paidHeavy} đơn vị dồn phần lớn nguồn lực vào kênh trả phí trong quý này.`);
  const bestCx = order.map((id) => st.cos[id]!.cx).reduce((a, b) => Math.max(a, b), 0);
  news.push(`Chỉ số trải nghiệm cao nhất phòng đang là ${Math.round(bestCx * 100)}/100 – đây là thứ sinh ra Earned Media.`);

  return { reports, news, values };
}

// ───────────────────────── điểm ─────────────────────────

function scorecardJt(st: JtState, id: string, _finished: boolean): RsScorecard {
  const co = st.cos[id]!;
  const business = 40 * clamp01(co.revenueCum / JT_REV_TARGET);
  const cx = 30 * (co.cxLog.length ? co.cxLog.reduce((a, b) => a + b, 0) / co.cxLog.length : 0.1);
  const brand = 30 * (co.brand.length ? co.brand.reduce((a, b) => a + b, 0) / co.brand.length : 0.2);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { total: r1(business + cx + brand), parts: { business: r1(business), cx: r1(cx), brand: r1(brand) } };
}

function colsJt(st: JtState, id: string, _finished: boolean): Record<string, number> {
  const co = st.cos[id]!;
  return {
    revenue: co.revenueCum,
    cx: Math.round(co.cx * 100),
    trust: Math.round(co.trust * 100),
    stages: JT_STAGES.reduce((a, s) => a + co.build[s], 0),
    incidents: co.incidents.length,
  };
}

function flagJt(st: JtState, id: string): string | undefined {
  return st.cos[id]?.concealed ? 'concealed' : undefined;
}

function viewJt(st: JtState, id: string, _round: number, finished: boolean): JtView {
  const co = st.cos[id]!;
  const likelihood = Math.min(5, Math.max(1, Math.round(1 + 4 * (JT_GOV_INFO[co.gov].risk * 0.8 + JT_AI_INFO[co.ai].risk * 2))));
  const impact = Math.min(5, Math.max(1, Math.round(1 + 4 * (1 - co.trust))));
  return {
    points: JT_POINTS,
    build: { ...co.build },
    ownedStock: co.ownedStock,
    fixes: [...co.fixes],
    gov: co.gov,
    ai: co.ai,
    revenueCum: co.revenueCum,
    cx: r3(co.cx),
    trust: r3(co.trust),
    open: co.open,
    riskScore: { likelihood, impact },
    concealed: co.concealed,
    truth: finished ? { weights: JT_STAGES.map((s) => ({ stage: s, weight: WEIGHT[s] })), incidents: co.incidents } : null,
  };
}

function badgesJt(st: JtState, id: string, order: string[]): string[] {
  const co = st.cos[id]!;
  const out: string[] = [];
  if (JT_STAGES.every((s) => co.build[s] >= 2)) out.push('whole');
  if (co.ownedStock >= 6) out.push('asset');
  if (co.cx * co.trust >= 0.45) out.push('earned');
  if (co.incidents.length > 0 && co.badMoves === 0 && co.incidents.every((x) => (x.steps ?? []).filter((s) => RIGHT[x.risk].includes(s)).length >= 2)) out.push('calm');
  if (!co.concealed) out.push('honest');
  const best = order.reduce((a, b) => (scorecardJt(st, b, true).total > scorecardJt(st, a, true).total ? b : a), order[0]!);
  if (best === id) out.push('leader');
  return out;
}

function pubJt(st: JtState, order: string[], _round: number): Record<string, unknown> {
  const cos = order.map((id) => st.cos[id]!);
  const pub: JtPub = {
    cx: r3(cos.reduce((a, c) => a + c.cx, 0) / Math.max(1, cos.length)),
    open: cos.filter((c) => c.open).length,
    incidents: cos.reduce((a, c) => a + c.incidents.length, 0),
  };
  return pub as unknown as Record<string, unknown>;
}

// ───────────────────────── máy chơi ─────────────────────────

/** Nâng giai đoạn thấp nhất trước: chuỗi vỡ ở khâu yếu nhất. */
function raiseLowest(build: Record<JtStage, number>, order: JtStage[], budget: number): number {
  let left = budget;
  for (let guard = 0; guard < JT_STAGES.length * JT_MAX_LEVEL && left > 0; guard++) {
    const next = order
      .filter((s) => build[s] < JT_MAX_LEVEL && (JT_STAGE_COST[build[s]] ?? 99) <= left)
      .sort((a, b) => build[a] - build[b] || order.indexOf(a) - order.indexOf(b))[0];
    if (!next) break;
    left -= JT_STAGE_COST[build[next]] ?? 0;
    build[next] += 1;
  }
  return left;
}

function botJt(archetype: string, level: BotLevel, st: JtState, playerId: string, round: number, _rng: Rng): JtDecision {
  const co = st.cos[playerId]!;
  const points = JT_POINTS + (level === 'hard' ? 1 : level === 'easy' ? -1 : 0);
  const build = { ...co.build };
  const d: JtDecision = { build, paid: 0, owned: 0, gov: co.gov, ai: co.ai, fixes: [...co.fixes], response: [] };

  // Xử lý sự cố đang mở.
  if (co.open) {
    if (archetype === 'hider') d.response = ['delete', 'respond', 'detect'];
    else if (archetype === 'loose' || archetype === 'buyreach') d.response = ['rebut', 'respond', 'detect'];
    else if (archetype === 'balanced' || archetype === 'websiteonly') d.response = [...RIGHT[co.open.risk]];
    else d.response = ['detect', 'respond', 'follow'];
  }

  const setup = (gov: JtGov, ai: JtAi) => {
    d.gov = gov;
    d.ai = ai;
  };
  let left = points;
  const spend = (n: number) => {
    left -= n;
  };

  if (archetype === 'buyreach') {
    setup('fast', 'direct');
    d.paid = Math.min(JT_MAX_PAID, left);
    spend(d.paid);
    left = raiseLowest(build, ['aware', 'consider', 'evaluate'], left);
    return d;
  }
  if (archetype === 'websiteonly') {
    setup(round >= 3 ? 'single' : 'fast', 'review');
    spend(JT_GOV_INFO[d.gov].cost + JT_AI_INFO[d.ai].cost);
    d.owned = Math.min(JT_MAX_OWNED, Math.max(0, left - 2));
    spend(d.owned);
    left = raiseLowest(build, JT_STAGES, left);
    return d;
  }
  if (archetype === 'loose') {
    setup('fast', 'direct');
    d.paid = Math.min(4, left);
    spend(d.paid);
    left = raiseLowest(build, JT_STAGES, left);
    return d;
  }
  if (archetype === 'frontonly') {
    setup('single', 'review');
    spend(JT_GOV_INFO[d.gov].cost + JT_AI_INFO[d.ai].cost);
    d.paid = Math.min(3, Math.max(0, left - 3));
    spend(d.paid);
    left = raiseLowest(build, ['aware', 'consider', 'evaluate', 'buy'], left);
    return d;
  }
  // hider và balanced chơi giống nhau; khác nhau ở cách xử lý sự cố.
  setup(round >= 3 ? 'full' : 'single', 'review');
  spend(JT_GOV_INFO[d.gov].cost + JT_AI_INFO[d.ai].cost);
  const fix = JT_FIXES.find((f) => !d.fixes.includes(f));
  if (fix && left >= JT_FIX_COST + 3) {
    d.fixes.push(fix);
    spend(JT_FIX_COST);
  }
  if (round <= 2) {
    d.paid = Math.min(3, Math.max(0, left - 4));
    spend(d.paid);
  } else {
    d.owned = Math.min(3, Math.max(0, left - 4));
    spend(d.owned);
    d.paid = Math.min(2, Math.max(0, left - 3));
    spend(d.paid);
  }
  left = raiseLowest(build, JT_STAGES, left);
  return d;
}

// ───────────────────────── khai báo game ─────────────────────────

export const JOURNEY_TRUST: RsGame<JtDecision, JtState, JtReport, JtView> = {
  id: 'journey-trust',
  rounds: JT_ROUNDS,
  label: 'Hành trình và niềm tin',
  botNames: ['Phú Mỹ', 'Dung Quất', 'Cà Mau', 'Nhơn Trạch', 'Thị Vải', 'Long Sơn'],
  archetypes: ['buyreach', 'websiteonly', 'loose', 'frontonly', 'hider'],
  defaultSettings: { decideSec: 300, resultsSec: 0, botLevel: 'medium', fillBots: true },
  init: initJt,
  validate: validateJt,
  fallback: fallbackJt,
  bot: botJt,
  simulate: simulateJt,
  scorecard: scorecardJt,
  cols: colsJt,
  flag: flagJt,
  view: viewJt,
  badges: badgesJt,
  pub: pubJt,
};
