// Game 4 "Tín hiệu sớm" – mô hình ẩn. CHỈ chạy ở máy chủ: file này biết chuyển dịch nào là thật
// và chất lượng thật của từng tín hiệu. Trình duyệt chỉ được nhập sg/types.ts.
import { GameError } from '../room.js';
import { shuffle, type Rng } from '../rng.js';
import type { RsGame, RsInput, RsRoundOut } from '../rs/room.js';
import type { RsRoomDoc, RsScorecard } from '../rs/types.js';
import type { BotLevel } from '../types.js';
import {
  SG_ACTIONS,
  SG_ACTION_INFO,
  SG_AI_EXTRA,
  SG_BLIND_LOSS,
  SG_BLIND_ROUND,
  SG_CROWD,
  SG_FIT,
  SG_FIT_MUL,
  SG_FRAME_INFO,
  SG_GROUPS,
  SG_GROUP_INFO,
  SG_HOURS,
  SG_JOB_BONUS,
  SG_JOB_BONUS_MUL,
  SG_MAX_EVIDENCE,
  SG_NO_EVIDENCE_MUL,
  SG_PROFIT_TARGET,
  SG_QUESTIONS,
  SG_RESTRICTED_FINE,
  SG_ROUNDS,
  SG_SHIFTS,
  SG_SHIFT_INFO,
  SG_VERIFY_COST,
  SG_WHEN_MUL,
  type SgAction,
  type SgDecision,
  type SgFrame,
  type SgGroup,
  type SgLine,
  type SgPub,
  type SgQuality,
  type SgQuestion,
  type SgReport,
  type SgShift,
  type SgSignal,
  type SgView,
} from './types.js';

// ───────────────────────── nội dung tín hiệu (máy chủ giữ) ─────────────────────────

interface Line {
  group: SgGroup;
  text: string;
}

/** Mỗi chuyển dịch phát ra tín hiệu qua nhiều nhóm thông tin khác nhau – đó là lý do phải theo dõi rộng. */
const LINES: Record<SgShift, Line[]> = {
  digital: [
    { group: 'tech', text: 'Hai nhà phân phối lớn mở cổng đặt hàng trực tuyến cho khách công nghiệp.' },
    { group: 'customer', text: 'Khảo sát 40 khách công nghiệp: 7/10 so sánh nhà cung cấp trên website trước khi gọi điện.' },
    { group: 'rival', text: 'Một đối thủ đưa toàn bộ hồ sơ kỹ thuật lên website, kèm công cụ tra cứu tiêu chuẩn.' },
    { group: 'size', text: 'Lượt tìm kiếm “báo giá nhiên liệu công nghiệp” tăng 2,4 lần so với cùng kỳ.' },
    { group: 'inside', text: 'Một phần ba yêu cầu báo giá đến từ biểu mẫu trên web, không qua nhân viên kinh doanh.' },
    { group: 'price', text: 'Khách mang bảng so sánh giá tải từ mạng vào buổi thương thảo.' },
  ],
  selfserve: [
    { group: 'customer', text: 'Khách đòi bộ tài liệu kỹ thuật trước khi đồng ý gặp nhân viên kinh doanh.' },
    { group: 'inside', text: 'Số câu hỏi kỹ thuật trong email đến tăng gấp đôi, trong khi số cuộc hẹn giảm.' },
    { group: 'rival', text: 'Đối thủ phát hành thư viện tiêu chuẩn và hướng dẫn chọn sản phẩm, tải tự do.' },
    { group: 'size', text: 'Diễn đàn kỹ thuật của ngành có thêm nhiều chủ đề so sánh nhà cung cấp.' },
    { group: 'price', text: 'Khách hỏi thẳng cấu trúc giá và điều kiện công nợ ngay lần gặp đầu tiên.' },
    { group: 'tech', text: 'Một sàn giao dịch doanh nghiệp trong nước bắt đầu niêm yết thông số sản phẩm công nghiệp.' },
  ],
  substitute: [
    { group: 'tech', text: 'Một nhà máy trong khu công nghiệp thử chuyển lò hơi sang điện, báo cáo giảm chi phí vận hành.' },
    { group: 'rival', text: 'Nhà cung cấp thiết bị điện chào gói “chuyển đổi nhiệt” kèm phương án thuê tài chính.' },
    { group: 'customer', text: 'Hai khách lớn đề nghị tư vấn phương án giảm phát thải, không hỏi thêm sản lượng nhiên liệu.' },
    { group: 'size', text: 'Sản lượng tiêu thụ ở nhóm khách chế biến đi ngang trong khi sản xuất của họ vẫn tăng.' },
    { group: 'inside', text: 'Đơn hàng lặp lại của ba khách giảm dần đều, và không phải vì giá.' },
    { group: 'price', text: 'Khách so sánh chi phí trên một đơn vị nhiệt, không so giá trên một tấn nhiên liệu.' },
  ],
  datadriven: [
    { group: 'inside', text: 'Dữ liệu bán hàng cho thấy một phân khúc có biên lợi nhuận cao gấp rưỡi phần còn lại.' },
    { group: 'size', text: 'Số liệu khu vực lệch nhau rõ giữa hai kỳ liên tiếp, không giải thích được bằng mùa vụ.' },
    { group: 'price', text: 'Biến động giá theo tuần có quy luật mà bảng giá quý không phản ánh.' },
    { group: 'customer', text: 'Phản hồi khách hàng gom lại cho thấy ba lý do rời đi lặp lại.' },
    { group: 'rival', text: 'Đối thủ điều chỉnh giá theo tuần, có vẻ dựa trên dữ liệu tồn kho.' },
    { group: 'tech', text: 'Một đơn vị thành viên đưa bảng điều khiển doanh thu vào cuộc họp tuần.' },
  ],
  aitarget: [
    { group: 'customer', text: 'Phân tích dữ liệu chỉ ra một nhóm khách nhỏ nhưng chịu trả thêm cho dịch vụ kỹ thuật.' },
    { group: 'rival', text: 'Đối thủ gửi nội dung khác nhau cho từng nhóm khách, không còn một bản dùng chung.' },
    { group: 'tech', text: 'Công cụ AI bắt đầu được dùng trong ngành để soạn hồ sơ kỹ thuật và thư chào hàng.' },
    { group: 'price', text: 'Chương trình giá riêng cho một nhóm khách hẹp đạt tỷ lệ nhận cao bất thường.' },
    { group: 'size', text: 'Một phân khúc nhỏ nhưng tăng nhanh xuất hiện trong số liệu thị trường.' },
    { group: 'inside', text: 'Chiến dịch gửi đúng nhóm khách có tỷ lệ phản hồi gấp ba chiến dịch gửi đại trà.' },
  ],
  solution: [
    { group: 'customer', text: 'Khách hỏi về cam kết độ tin cậy cung ứng và hỗ trợ kỹ thuật, không chỉ hỏi giá.' },
    { group: 'rival', text: 'Đối thủ bán kèm dịch vụ bảo trì và tư vấn vận hành trong cùng một hợp đồng.' },
    { group: 'price', text: 'Khách chấp nhận giá cao hơn khi có cam kết thời gian xử lý sự cố.' },
    { group: 'inside', text: 'Hợp đồng có kèm dịch vụ kỹ thuật có tỷ lệ tái ký cao hơn hẳn.' },
    { group: 'size', text: 'Phần giá trị dịch vụ trong các gói thầu của ngành tăng lên.' },
    { group: 'tech', text: 'Hệ thống theo dõi vận hành từ xa cho phép bán kèm cam kết dịch vụ.' },
  ],
};

/** Tín hiệu nhiễu: có thể đúng, nhưng không nói gì về chuyển dịch nào. */
const NOISE: Record<SgGroup, string[]> = {
  size: ['Giá thuê kho bãi trong vùng tăng theo quý.', 'Một báo cáo ngành dự báo tăng trưởng chung 3–4%.', 'Số doanh nghiệp đăng ký mới trong khu công nghiệp tăng nhẹ.'],
  customer: ['Một khách lớn đổi người phụ trách mua hàng.', 'Khách phàn nàn về mẫu biểu thanh toán.', 'Một hộ kinh doanh hỏi mua lượng rất nhỏ.'],
  rival: ['Một đối thủ đổi logo và thông điệp quảng cáo.', 'Đối thủ tuyển thêm nhân viên bán hàng khu vực.', 'Một đối thủ nhỏ rút khỏi một địa bàn.'],
  price: ['Chi phí vận chuyển nội địa tăng do giá cầu đường.', 'Một đại lý xin nới hạn công nợ.', 'Bảng giá niêm yết của một đối thủ không đổi suốt hai quý.'],
  tech: ['Hội thảo ngành sắp tổ chức ở thành phố.', 'Một tiêu chuẩn kỹ thuật đang được rà soát, chưa có hiệu lực.', 'Phần mềm quản lý kho của đơn vị được nâng cấp.'],
  inside: ['Tỷ lệ giao hàng đúng hẹn giữ nguyên.', 'Chi phí bán hàng trên doanh thu đi ngang.', 'Một nhân viên kinh doanh chuyển vùng phụ trách.'],
};

const SOURCE: Record<SgGroup, string> = {
  size: 'Báo cáo ngành',
  customer: 'Khảo sát khách hàng',
  rival: 'Theo dõi đối thủ',
  price: 'Bản tin giá',
  tech: 'Bản tin công nghệ',
  inside: 'Dữ liệu nội bộ',
};
const AI_SOURCE = 'AI tổng hợp';
/** Bản tổng hợp của AI: cứ khoảng ba bản có một bản chứa số liệu bịa. */
const AI_FABRICATED = 0.3;

// ───────────────────────── trạng thái ẩn ─────────────────────────

interface HiddenSignal extends SgSignal {
  /** Chất lượng thật, luôn có ở máy chủ. */
  quality: SgQuality;
  /** Chuyển dịch thật mà tín hiệu nói tới (null = nhiễu). */
  shift: SgShift | null;
}

export interface SgShiftState {
  shift: SgShift;
  real: boolean;
  /** Quý mà chuyển dịch bắt đầu ăn tiền (0 nếu không có thật). */
  from: number;
}

export interface SgCo {
  /** Cảm biến đang hoạt động (chọn ở quý trước). */
  sensors: SgGroup[];
  everSensors: SgGroup[];
  ai: boolean;
  watch: SgShift | null;
  known: Record<string, { quality: SgQuality; shift: SgShift | null }>;
  confirmed: Partial<Record<SgShift, boolean>>;
  actedOn: Partial<Record<SgShift, number>>;
  /** Quý đầu tiên hành động vào chuyển dịch đó VỚI bằng chứng đã kiểm chứng – đây mới là đọc tín hiệu sớm. */
  provenOn: Partial<Record<SgShift, number>>;
  profitCum: number;
  disc: number[];
  verified: number;
  jobRounds: number;
  aiRounds: number;
  blind: boolean;
  shiftsHit: number;
}

export interface SgState {
  shifts: SgShiftState[];
  pool: Record<string, HiddenSignal[]>;
  cos: Record<string, SgCo>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pick = <X>(rng: Rng, xs: readonly X[]): X => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]!;

function qualityOf(rng: Rng, kind: 'real' | 'fake' | 'noise', group: SgGroup): SgQuality {
  const u = rng();
  if (kind === 'real') {
    // Dữ liệu nội bộ và dữ liệu khách hàng là nơi hay gặp vấn đề quyền sử dụng.
    if ((group === 'inside' || group === 'customer') && u < 0.1) return 'restricted';
    if (u < 0.72) return 'solid';
    if (u < 0.88) return 'thin';
    return 'stale';
  }
  if (kind === 'fake') {
    if (u < 0.62) return 'false';
    if (u < 0.85) return 'thin';
    return 'stale';
  }
  if (u < 0.4) return 'solid';
  if (u < 0.68) return 'thin';
  if (u < 0.85) return 'restricted';
  return 'false';
}

/** Chuyển dịch thật phát tín hiệu từ một quý trước khi nó ăn tiền; chuyển dịch giả gây nhiễu từ quý 2. */
const emitting = (st: SgState, round: number) => st.shifts.filter((s) => (s.real ? round >= s.from - 1 : round >= 2));

function buildPool(st: SgState, rng: Rng) {
  for (let r = 1; r <= SG_ROUNDS; r++) {
    const live = emitting(st, r);
    const out: HiddenSignal[] = [];
    let n = 0;
    const add = (group: SgGroup, text: string, shift: SgShift | null, kind: 'real' | 'fake' | 'noise', ai = false) => {
      n++;
      out.push({
        id: `s${r}-${n}`,
        round: r,
        group,
        source: ai ? AI_SOURCE : SOURCE[group],
        text,
        ...(ai ? { ai: true } : {}),
        quality: ai && rng() < AI_FABRICATED ? 'false' : qualityOf(rng, kind, group),
        shift,
      });
    };
    // Một chỗ cho mỗi nhóm thông tin: ưu tiên tin có nội dung, nếu không thì tin nhiễu.
    for (const g of SG_GROUPS) {
      const cands = live.flatMap((s) => LINES[s.shift].filter((l) => l.group === g).map((l) => ({ s, l })));
      if (cands.length && rng() < 0.62) {
        const c = pick(rng, cands);
        add(g, c.l.text, c.s.shift, c.s.real ? 'real' : 'fake');
      } else {
        add(g, pick(rng, NOISE[g]), null, 'noise');
      }
    }
    // Thêm vài tín hiệu nữa dồn vào các chuyển dịch đang hoạt động.
    for (let k = 0; k < 3 && live.length; k++) {
      const s = pick(rng, live);
      const l = pick(rng, LINES[s.shift]);
      add(l.group, l.text, s.shift, s.real ? 'real' : 'fake');
    }
    // Bản tổng hợp của AI: chỉ ai bật mới thấy.
    for (let k = 0; k < SG_AI_EXTRA && live.length; k++) {
      const s = pick(rng, live);
      const l = pick(rng, LINES[s.shift]);
      add(l.group, l.text, s.shift, s.real ? 'real' : 'fake', true);
    }
    st.pool[String(r)] = out;
  }
}

function newCo(): SgCo {
  return {
    sensors: [],
    everSensors: [],
    ai: false,
    watch: null,
    known: {},
    confirmed: {},
    actedOn: {},
    provenOn: {},
    profitCum: 0,
    disc: [],
    verified: 0,
    jobRounds: 0,
    aiRounds: 0,
    blind: false,
    shiftsHit: 0,
  };
}

function initSg(order: string[], _room: RsRoomDoc, rng: Rng): SgState {
  // "Cạnh tranh giữa các giải pháp" luôn là chuyển dịch thật: đó là bài học chính của chuyên đề.
  const others = shuffle(rng, SG_SHIFTS.filter((s) => s !== 'substitute'));
  const st: SgState = {
    shifts: [
      { shift: 'substitute', real: true, from: rng() < 0.5 ? 4 : 5 },
      { shift: others[0]!, real: true, from: 3 },
      { shift: others[1]!, real: true, from: 4 },
      { shift: others[2]!, real: false, from: 0 },
      { shift: others[3]!, real: false, from: 0 },
    ],
    pool: {},
    cos: Object.fromEntries(order.map((id) => [id, newCo()])),
  };
  buildPool(st, rng);
  return st;
}

const shiftOf = (st: SgState, s: SgShift | null) => (s ? st.shifts.find((x) => x.shift === s) : undefined);

/** Tín hiệu quý `round` mà đơn vị này nhìn thấy, theo cảm biến đã bật từ quý trước. */
function visibleOf(st: SgState, co: SgCo, round: number): HiddenSignal[] {
  const pool = st.pool[String(round)] ?? [];
  const out = pool.filter((s) => (s.ai ? co.ai : co.sensors.includes(s.group)));
  // Giả thuyết làm việc kéo thêm một tín hiệu thuộc chuyển dịch đó, kể cả ngoài vùng cảm biến.
  if (co.watch) {
    const extra = pool.find((s) => s.shift === co.watch && !s.ai && !out.includes(s));
    if (extra) out.push(extra);
  }
  return out;
}

/** Tra một tín hiệu bất kỳ trong cả trận (bằng chứng có thể là tín hiệu đã kiểm chứng ở quý trước). */
function findSignal(st: SgState, id: string): HiddenSignal | undefined {
  for (const list of Object.values(st.pool)) {
    const hit = list.find((s) => s.id === id);
    if (hit) return hit;
  }
  return undefined;
}

const strip = (s: HiddenSignal, co: SgCo): SgSignal => {
  const k = co.known[s.id];
  const { quality: _q, shift: _s, ...rest } = s;
  return k ? { ...rest, quality: k.quality, shift: k.shift } : rest;
};

// ───────────────────────── kiểm tra dữ liệu nộp lên ─────────────────────────

export function sgSpent(d: SgDecision): number {
  return (
    d.sensors.reduce((a, g) => a + SG_GROUP_INFO[g].cost, 0) +
    d.verify.length * SG_VERIFY_COST +
    SG_ACTION_INFO[d.action].cost +
    SG_FRAME_INFO[d.frame].cost
  );
}

function validateSg(raw: unknown, round: number, st: SgState, playerId: string): SgDecision {
  const o = (raw ?? {}) as Partial<SgDecision>;
  const co = st.cos[playerId];
  if (!co) throw new GameError('no_player', 'Không có đơn vị này trong phòng.', 404);
  const question: SgQuestion = SG_QUESTIONS.includes(o.question as SgQuestion) ? (o.question as SgQuestion) : 'growth';
  const frame: SgFrame = o.frame === 'job' ? 'job' : 'product';
  const action: SgAction = SG_ACTIONS.includes(o.action as SgAction) ? (o.action as SgAction) : 'none';
  const sensors = SG_GROUPS.filter((g) => Array.isArray(o.sensors) && (o.sensors as string[]).includes(g));
  const visible = visibleOf(st, co, round);
  const ids = new Set(visible.map((s) => s.id));
  const verify = [...new Set(Array.isArray(o.verify) ? (o.verify as string[]) : [])].filter((id) => ids.has(id) && !co.known[id]);
  // Bằng chứng: tín hiệu đang thấy trong quý này, hoặc bất kỳ tín hiệu đã kiểm chứng từ các quý trước.
  const evidence = [...new Set(Array.isArray(o.evidence) ? (o.evidence as string[]) : [])].filter((id) => ids.has(id) || co.known[id]).slice(0, SG_MAX_EVIDENCE);
  const target = SG_SHIFTS.includes(o.target as SgShift) ? (o.target as SgShift) : null;
  const watch = SG_SHIFTS.includes(o.watch as SgShift) ? (o.watch as SgShift) : null;
  const d: SgDecision = { question, sensors, verify, aiDigest: Boolean(o.aiDigest), frame, action, target, evidence, watch };
  if (action !== 'none' && !target) throw new GameError('no_target', 'Chọn chuyển dịch mà hành động này đặt cược vào.', 400);
  const spent = sgSpent(d);
  if (spent > SG_HOURS) throw new GameError('over_hours', `Kế hoạch cần ${spent} giờ phân tích, chỉ có ${SG_HOURS}.`, 400);
  return d;
}

function fallbackSg(_st: SgState, _playerId: string, _round: number, last: SgDecision | undefined): SgDecision {
  // Không nộp: giữ cảm biến và cách đặt vấn đề của quý trước, không hành động, không kiểm chứng.
  return {
    question: last?.question ?? 'growth',
    sensors: last?.sensors ?? [],
    verify: [],
    aiDigest: last?.aiDigest ?? false,
    frame: last?.frame ?? 'product',
    action: 'none',
    target: null,
    evidence: [],
    watch: last?.watch ?? null,
  };
}

// ───────────────────────── mô phỏng một quý ─────────────────────────

const whenMul = (round: number, from: number) =>
  round < from - 1
    ? SG_WHEN_MUL.premature
    : round === from - 1
      ? SG_WHEN_MUL.early
      : round === from
        ? SG_WHEN_MUL.onTime
        : round === from + 1
          ? SG_WHEN_MUL.late
          : SG_WHEN_MUL.tooLate;
const whenPoints = (round: number, from: number) => (round < from - 1 ? 2.25 : round === from - 1 ? 15 : round === from ? 11 : round === from + 1 ? 7.5 : 4);

function simulateSg(st: SgState, order: string[], inputs: Record<string, RsInput<SgDecision>>, round: number, _rng: Rng): RsRoundOut<SgReport> {
  const reports: Record<string, SgReport> = {};
  const values: Record<string, number> = {};
  const news: string[] = [];
  // Bao nhiêu đơn vị cùng đặt cược vào mỗi chuyển dịch trong quý này.
  const betCount: Partial<Record<SgShift, number>> = {};
  for (const id of order) {
    const d = inputs[id]!.decision;
    if (d.action !== 'none' && d.target) betCount[d.target] = (betCount[d.target] ?? 0) + 1;
  }
  let blindHits = 0;
  let blindBets = 0;

  for (const id of order) {
    const co = st.cos[id]!;
    const d = inputs[id]!.decision;
    const visible = visibleOf(st, co, round);
    const byId = new Map(visible.map((s) => [s.id, s]));
    const lines: SgLine[] = [];
    const notes: string[] = [];

    // Kết quả kiểm chứng của quý này chỉ dùng được từ quý sau: phân tích xong rồi mới đề xuất.
    const knownBefore = { ...co.known };
    // Bước 3 – kiểm chứng.
    const checked: SgSignal[] = [];
    for (const sid of d.verify) {
      const sig = byId.get(sid);
      if (!sig) continue;
      co.known[sid] = { quality: sig.quality, shift: sig.shift };
      co.verified++;
      checked.push(strip(sig, co));
    }

    // Bước 5 – quyết định.
    let profit = 0;
    let real: boolean | null = null;
    const ts = d.target;
    const sstate = shiftOf(st, ts);
    const cited = d.evidence.map((sid) => byId.get(sid) ?? findSignal(st, sid)).filter((s): s is HiddenSignal => Boolean(s));
    const citedBad = cited.some((s) => s.quality === 'false' || s.quality === 'restricted');
    const unverifiedAi = cited.some((s) => s.ai && !co.known[s.id]);

    if (d.action !== 'none' && sstate) {
      real = sstate.real;
      const info = SG_ACTION_INFO[d.action];
      const fitIdx = SG_FIT[sstate.shift].indexOf(d.action);
      const fit = SG_FIT_MUL[fitIdx < 0 ? 2 : fitIdx]!;
      if (sstate.real) {
        const crowd = Math.max(0, (betCount[sstate.shift] ?? 1) - 1);
        let gain = info.gain * fit * whenMul(round, sstate.from) * SG_FRAME_INFO[d.frame].mul * (1 - SG_CROWD * crowd);
        if (d.frame === 'job' && SG_JOB_BONUS.includes(sstate.shift)) gain *= SG_JOB_BONUS_MUL;
        // Bằng chứng yếu (lỗi thời, thiếu đại diện) thì hành động cũng lệch: ăn ít hơn.
        const support = cited.filter((s) => s.shift === sstate.shift);
        if (support.length && support.every((s) => s.quality === 'stale' || s.quality === 'thin')) gain *= 0.7;
        // Không có bằng chứng đã kiểm chứng cho đúng chuyển dịch: lãnh đạo chỉ duyệt một phần.
        const proven = support.some((s) => knownBefore[s.id]);
        if (!proven) gain *= SG_NO_EVIDENCE_MUL;
        profit += gain;
        lines.push({
          label: `${SG_ACTION_INFO[d.action].name} · ${SG_SHIFT_INFO[sstate.shift].name}`,
          value: r2(gain),
          note: !proven ? 'chưa có bằng chứng đã kiểm chứng: chỉ được duyệt một phần' : crowd > 0 ? `${crowd} đơn vị khác cùng đánh vào đây` : 'chưa ai tranh',
        });
        if (!proven) notes.push('Quyết định không có bằng chứng đã kiểm chứng nên chỉ được duyệt một phần. Cơ hội có thật, nhưng bạn không chứng minh được nó.');
        if (co.actedOn[sstate.shift] === undefined) {
          co.actedOn[sstate.shift] = round;
          co.shiftsHit++;
        }
        if (proven && co.provenOn[sstate.shift] === undefined) co.provenOn[sstate.shift] = round;
      } else {
        const loss = info.loss * (unverifiedAi ? 2 : 1);
        profit -= loss;
        lines.push({ label: `${SG_ACTION_INFO[d.action].name} · ${SG_SHIFT_INFO[sstate.shift].name}`, value: r2(-loss), note: unverifiedAi ? 'chuyển dịch không có thật, và bằng chứng là bản tổng hợp AI chưa kiểm chứng' : 'chuyển dịch này không có thật' });
        notes.push(`Chuyển dịch “${SG_SHIFT_INFO[sstate.shift].name}” không có thật. Khoản đầu tư mất ${loss.toFixed(1)} tỷ.`);
      }
      // Thử nghiệm là cách mua sự chắc chắn: quý sau bạn biết chuyển dịch đó có thật hay không.
      if (d.action === 'probe') co.confirmed[sstate.shift] = sstate.real;
    }

    // Cách đặt vấn đề theo sản phẩm cho một ít doanh thu đều đặn.
    const flat = SG_FRAME_INFO[d.frame].flat;
    if (flat > 0) {
      profit += flat;
      lines.push({ label: 'Doanh thu từ cách bán hiện tại', value: r2(flat) });
    }

    // Quyền sử dụng dữ liệu: dùng là vi phạm, dù tin có đúng hay không.
    if (cited.some((s) => s.quality === 'restricted')) {
      profit -= SG_RESTRICTED_FINE;
      lines.push({ label: 'Xử lý vi phạm dữ liệu', value: -SG_RESTRICTED_FINE, note: 'quyết định dựa trên dữ liệu không được phép dùng' });
      notes.push('Một bằng chứng bạn dùng là dữ liệu không được phép sử dụng. Thông tin đúng vẫn không đủ: phải có quyền dùng nó.');
    }

    // Quý 4: ai chưa bao giờ theo dõi đối thủ và công nghệ thì không thấy giải pháp thay thế.
    const sub = shiftOf(st, 'substitute')!;
    if (round === SG_BLIND_ROUND && sub.real && !co.blind && !co.everSensors.includes('rival') && !co.everSensors.includes('tech')) {
      co.blind = true;
      profit -= SG_BLIND_LOSS;
      blindHits++;
      lines.push({ label: 'Mất một phân khúc', value: -SG_BLIND_LOSS, note: 'khách chuyển sang một giải pháp thay thế' });
      notes.push('Một phân khúc khách hàng đã chuyển sang giải pháp thay thế. Bạn chưa bao giờ theo dõi đối thủ và công nghệ nên không thấy nó đến.');
    }
    if (d.action !== 'none' && ts === 'substitute') blindBets++;

    // Bước 6 – kỷ luật thông tin.
    let disc: number;
    if (d.action === 'none') disc = cited.length === 0 ? 0.45 : 0.4;
    else if (citedBad) disc = 0;
    else if (!cited.length) disc = 0.15;
    else if (!cited.every((s) => knownBefore[s.id])) disc = 0.4;
    else if (!cited.some((s) => knownBefore[s.id]?.shift === ts)) disc = 0.6;
    else disc = cited.some((s) => s.quality === 'stale' || s.quality === 'thin') ? 0.8 : 1;
    // Giữ một giả thuyết đã bị dữ liệu phủ nhận.
    if (d.watch && Object.values(co.known).some((k) => k.shift === d.watch && k.quality === 'false')) {
      disc *= 0.5;
      notes.push('Bạn vẫn giữ một giả thuyết mà chính dữ liệu đã kiểm chứng của bạn nói là không đúng.');
    }
    co.disc.push(clamp01(disc));

    // Lựa chọn của quý này có hiệu lực từ quý sau: cảm biến, AI và giả thuyết làm việc.
    co.sensors = d.sensors;
    for (const g of d.sensors) if (!co.everSensors.includes(g)) co.everSensors.push(g);
    co.ai = d.aiDigest;
    co.watch = d.watch;
    if (d.frame === 'job') co.jobRounds++;
    if (d.aiDigest) co.aiRounds++;

    co.profitCum = r2(co.profitCum + profit);
    values[id] = co.profitCum;
    reports[id] = {
      round,
      checked,
      action: d.action,
      target: ts,
      real,
      lines,
      profit: r2(profit),
      profitCum: co.profitCum,
      discipline: Math.round(clamp01(disc) * 100),
      notes,
    };
  }

  // Tin thị trường: công khai mức độ đông, không nói ai.
  const hottest = (Object.entries(betCount) as [SgShift, number][]).sort((a, b) => b[1] - a[1])[0];
  if (hottest && hottest[1] > 1) news.push(`${hottest[1]} đơn vị cùng đặt cược vào “${SG_SHIFT_INFO[hottest[0]].name}” trong quý này.`);
  if (blindBets === 0 && round >= 2) news.push('Chưa đơn vị nào đặt cược vào khả năng khách chuyển sang một giải pháp thay thế.');
  if (blindHits > 0) news.push(`${blindHits} đơn vị mất một phân khúc vì khách chuyển sang giải pháp thay thế.`);
  const liveNext = emitting(st, round + 1).filter((s) => s.real && s.from === round + 1);
  if (liveNext.length) news.push('Quý sau sẽ là quý mà một chuyển dịch bắt đầu ảnh hưởng tới doanh thu của cả thị trường.');
  if (!news.length) news.push('Thị trường chưa có tin nào đủ lớn để cả phòng cùng thấy.');

  return { reports, news, values };
}

// ───────────────────────── điểm ─────────────────────────

function scorecardSg(st: SgState, id: string, _finished: boolean): RsScorecard {
  const co = st.cos[id]!;
  const profit = 45 * clamp01(co.profitCum / SG_PROFIT_TARGET);
  let early = 0;
  for (const s of st.shifts) {
    if (!s.real) continue;
    // Chỉ tính cho hành động có bằng chứng đã kiểm chứng: đọc được tín hiệu sớm, không phải đoán sớm.
    const at = co.provenOn[s.shift];
    if (at !== undefined) early += whenPoints(at, s.from);
  }
  early = Math.min(30, early);
  const discipline = 25 * (co.disc.length ? co.disc.reduce((a, b) => a + b, 0) / co.disc.length : 0.4);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { total: r1(profit + early + discipline), parts: { profit: r1(profit), early: r1(early), discipline: r1(discipline) } };
}

function colsSg(st: SgState, id: string, _finished: boolean): Record<string, number> {
  const co = st.cos[id]!;
  return {
    profit: co.profitCum,
    shifts: co.shiftsHit,
    verified: co.verified,
    disc: co.disc.length ? Math.round((co.disc.reduce((a, b) => a + b, 0) / co.disc.length) * 100) : 0,
  };
}

function viewSg(st: SgState, id: string, round: number, finished: boolean): SgView {
  const co = st.cos[id]!;
  const visible = visibleOf(st, co, round);
  const known: SgSignal[] = [];
  for (const [r, list] of Object.entries(st.pool)) {
    void r;
    for (const s of list) if (co.known[s.id]) known.push(strip(s, co));
  }
  return {
    hours: SG_HOURS,
    signals: finished ? [] : visible.map((s) => strip(s, co)),
    known: known.sort((a, b) => a.round - b.round),
    sensors: co.sensors,
    ai: co.ai,
    watch: co.watch,
    profitCum: co.profitCum,
    confirmed: co.confirmed,
    truth: finished ? st.shifts.map((s) => ({ shift: s.shift, real: s.real, from: s.real ? s.from : null })) : null,
  };
}

function badgesSg(st: SgState, id: string, order: string[]): string[] {
  const co = st.cos[id]!;
  const out: string[] = [];
  const realShifts = st.shifts.filter((s) => s.real);
  if (realShifts.some((s) => (co.provenOn[s.shift] ?? 99) <= s.from - 1)) out.push('early');
  if (co.disc.length && co.disc.every((v) => v >= 0.8)) out.push('clean');
  if (co.jobRounds >= 4) out.push('job');
  if (co.actedOn['substitute'] !== undefined) out.push('wide');
  if (co.everSensors.length <= 3 && co.profitCum >= SG_PROFIT_TARGET * 0.7) out.push('lean');
  const best = order.reduce((a, b) => (scorecardSg(st, b, true).total > scorecardSg(st, a, true).total ? b : a), order[0]!);
  if (best === id) out.push('leader');
  return out;
}

function pubSg(st: SgState, order: string[], _round: number): Record<string, unknown> {
  const bets: Partial<Record<SgShift, number>> = {};
  const watchers: Partial<Record<SgGroup, number>> = {};
  for (const id of order) {
    const co = st.cos[id]!;
    for (const s of SG_SHIFTS) if (co.actedOn[s] !== undefined) bets[s] = (bets[s] ?? 0) + 1;
    for (const g of co.sensors) watchers[g] = (watchers[g] ?? 0) + 1;
  }
  const pub: SgPub = { bets, watchers };
  return pub as unknown as Record<string, unknown>;
}

// ───────────────────────── máy chơi ─────────────────────────

const SENSORS: Record<string, SgGroup[]> = {
  hoarder: SG_GROUPS,
  believer: ['customer', 'rival'],
  pricewatch: ['price', 'inside'],
  aionly: ['size'],
  latecomer: ['customer', 'rival'],
  reader: ['rival', 'tech'],
};

function affordable(d: SgDecision, hours: number): boolean {
  return sgSpent(d) <= hours;
}

/** Hành động hợp với chuyển dịch và còn đủ giờ. */
function actionFor(shift: SgShift, left: number): SgAction {
  for (const a of SG_FIT[shift]) if (SG_ACTION_INFO[a].cost <= left) return a;
  return SG_ACTION_INFO.probe.cost <= left ? 'probe' : 'none';
}

function botSg(archetype: string, level: BotLevel, st: SgState, playerId: string, round: number, rng: Rng): SgDecision {
  const co = st.cos[playerId]!;
  const hours = SG_HOURS + (level === 'hard' ? 1 : level === 'easy' ? -1 : 0);
  const visible = visibleOf(st, co, round);
  const d: SgDecision = {
    question: pick(rng, SG_QUESTIONS),
    sensors: SENSORS[archetype] ?? ['customer'],
    verify: [],
    aiDigest: archetype === 'aionly',
    frame: archetype === 'latecomer' || archetype === 'reader' ? 'job' : 'product',
    action: 'none',
    target: null,
    evidence: [],
    watch: null,
  };
  const fresh = visible.filter((s) => !co.known[s.id]);
  const left = () => hours - sgSpent(d);

  const bet = (shift: SgShift, evidence: string[]) => {
    const a = actionFor(shift, left());
    if (a === 'none') return;
    d.action = a;
    d.target = shift;
    d.evidence = evidence.slice(0, SG_MAX_EVIDENCE);
    d.watch = shift;
    if (!affordable(d, hours)) {
      d.action = 'none';
      d.target = null;
      d.evidence = [];
    }
  };

  if (archetype === 'hoarder') {
    // Bật hết, kiểm chứng tới khi hết giờ, và không còn gì để hành động.
    for (const s of fresh) {
      if (left() < SG_VERIFY_COST) break;
      d.verify.push(s.id);
    }
    return d;
  }
  if (archetype === 'believer') {
    // Thấy là tin, không kiểm chứng.
    const lead = fresh.find((s) => s.shift) ?? fresh[0];
    if (lead?.shift) bet(lead.shift, [lead.id]);
    return d;
  }
  if (archetype === 'pricewatch') {
    const lead = visible.find((s) => s.shift && (s.group === 'price' || s.group === 'inside'));
    if (lead && left() >= SG_VERIFY_COST && !co.known[lead.id]) d.verify.push(lead.id);
    if (lead?.shift) bet(lead.shift, [lead.id]);
    return d;
  }
  if (archetype === 'aionly') {
    const lead = visible.find((s) => s.ai && s.shift) ?? visible.find((s) => s.shift);
    if (lead?.shift) bet(lead.shift, [lead.id]);
    return d;
  }
  // Thư viện bằng chứng: tín hiệu đã kiểm chứng từ các quý trước, còn dùng được.
  const library = Object.entries(co.known)
    .filter(([, k]) => k.quality === 'solid' && k.shift)
    .map(([id, k]) => ({ id, shift: k.shift! }));
  const provenShift = (skip: Partial<Record<SgShift, unknown>>) => library.find((e) => skip[e.shift] === undefined && co.confirmed[e.shift] !== false);

  if (archetype === 'latecomer') {
    // Chờ cho chắc: kiểm chứng nhiều, chỉ hành động ở cuối trận, khi phần chia đã nhỏ.
    const acts = round >= (level === 'hard' ? 3 : 4);
    for (const s of fresh) {
      if (left() < SG_VERIFY_COST + (acts ? SG_ACTION_INFO.solution.cost : 0)) break;
      d.verify.push(s.id);
      if (d.verify.length >= 2) break;
    }
    if (acts) {
      const e = provenShift(co.actedOn) ?? library[0];
      if (e) bet(e.shift, [e.id]);
    }
    return d;
  }

  // reader: kiểm chứng trước, quý sau mới đánh – và chỉ đánh vào chuyển dịch đã có bằng chứng.
  const e = provenShift(co.actedOn);
  if (e) bet(e.shift, [e.id]);
  for (const s of fresh.filter((x) => x.shift)) {
    if (left() < SG_VERIFY_COST) break;
    d.verify.push(s.id);
    if (d.verify.length >= 2) break;
  }
  if (!d.watch && library[0]) d.watch = library[0].shift;
  return d;
}

// ───────────────────────── khai báo game ─────────────────────────

export const SIGNAL_ROOM: RsGame<SgDecision, SgState, SgReport, SgView> = {
  id: 'signal-room',
  rounds: SG_ROUNDS,
  label: 'Tín hiệu sớm',
  // Tên trung lập: tên không được hé ra lối chơi của máy.
  botNames: ['Trường Sơn', 'Bạch Đằng', 'Hồng Hà', 'An Khê', 'Vân Phong', 'Thiên Ấn'],
  archetypes: ['hoarder', 'believer', 'pricewatch', 'aionly', 'latecomer'],
  defaultSettings: { decideSec: 300, resultsSec: 0, botLevel: 'medium', fillBots: true },
  init: initSg,
  validate: validateSg,
  fallback: fallbackSg,
  bot: botSg,
  simulate: simulateSg,
  scorecard: scorecardSg,
  cols: colsSg,
  view: viewSg,
  badges: badgesSg,
  pub: pubSg,
};
