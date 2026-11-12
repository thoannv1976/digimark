// Game 3 – Săn hợp đồng trọng điểm (ABM, case C): public types and display content.
// Data-free about the hidden part: influence and pains per factory live in model.ts (server only).
import type { BotLevel } from '../types.js';

export type FactoryId = 'NM05' | 'NM19' | 'NM22' | 'NM17' | 'NM25' | 'NM20' | 'NM13' | 'NM28';
export type RoleId = 'foreman' | 'qc' | 'buyer' | 'cfo' | 'ceo';
/** A pain of the buying committee; each one has a matching evidence card and benefit card. */
export type Theme = 'stock' | 'tech' | 'quality' | 'fx' | 'green' | 'price';
export type ClusterId = 'film' | 'woven' | 'molding';
export type Source = 'import' | 'mixed' | 'domestic';
export type AbmPrice = 'p3' | 'p15' | 'p0' | 'm2';
export type AbmArchetype = 'fair' | 'spread' | 'price' | 'tech' | 'abm';
export type Influence = 1 | 2 | 3;

export const FACTORY_IDS: FactoryId[] = ['NM05', 'NM19', 'NM22', 'NM17', 'NM25', 'NM20', 'NM13', 'NM28'];
export const ROLES: RoleId[] = ['foreman', 'qc', 'buyer', 'cfo', 'ceo'];
export const THEMES: Theme[] = ['stock', 'tech', 'quality', 'fx', 'green', 'price'];
export const CLUSTERS: ClusterId[] = ['film', 'woven', 'molding'];
export const PRICES: AbmPrice[] = ['p3', 'p15', 'p0', 'm2'];

/** 3 months of approach, then the bid round. */
export const MONTHS = 3;
export const BID_ROUND = MONTHS + 1;
export const AP_PER_MONTH = 10;
export const MAX_BIDS = 4;
export const CARDS_PER_BID = 3;
export const TRIALS_PER_FACTORY = 2;
/** Assumed price, triệu đồng per tonne; contracts are 12-month trials for 30% of demand. */
export const PRICE_PER_TONNE = 30;
export const CONTRACT_SHARE = 0.3;
export const MAX_STARS = 5;

export interface FactoryInfo {
  id: FactoryId;
  sector: string;
  cluster: ClusterId;
  province: string;
  demand: number;
  source: Source;
  eu: boolean;
  relation: 'none' | 'met' | 'trial' | 'customer';
  news: string;
  /** "Vai trò đã liên hệ được" in the sheet. */
  contacted: RoleId[];
}

/** Sheet "Nhà máy mục tiêu" of Học liệu 04 (public data). */
export const FACTORIES: Record<FactoryId, FactoryInfo> = {
  NM05: { id: 'NM05', sector: 'Bao bì màng ghép thực phẩm', cluster: 'film', province: 'Đồng Nai', demand: 11500, source: 'import', eu: false, relation: 'none', news: 'Công bố mở rộng dây chuyền năm 2027', contacted: ['foreman'] },
  NM19: { id: 'NM19', sector: 'Bao bì màng ghép thực phẩm', cluster: 'film', province: 'Tây Ninh', demand: 10800, source: 'import', eu: true, relation: 'trial', news: 'Đang tuyển kỹ sư QC, kỹ sư quy trình', contacted: [] },
  NM22: { id: 'NM22', sector: 'Chai lọ, nắp nhựa', cluster: 'molding', province: 'Đồng Nai', demand: 8300, source: 'import', eu: false, relation: 'trial', news: 'Vừa nhận chứng nhận an toàn thực phẩm cho bao bì xuất khẩu', contacted: ['buyer'] },
  NM17: { id: 'NM17', sector: 'Sợi, dây đai PP', cluster: 'molding', province: 'TP.HCM', demand: 8200, source: 'mixed', eu: true, relation: 'met', news: 'Công bố mở rộng dây chuyền năm 2027', contacted: [] },
  NM25: { id: 'NM25', sector: 'Bao bì màng ghép thực phẩm', cluster: 'film', province: 'TP.HCM', demand: 6700, source: 'import', eu: true, relation: 'none', news: 'Ký hợp đồng cung cấp bao bì cho chuỗi bán lẻ lớn', contacted: ['buyer'] },
  NM20: { id: 'NM20', sector: 'Bao dệt PP', cluster: 'woven', province: 'Đồng Nai', demand: 5100, source: 'import', eu: false, relation: 'met', news: 'Ký hợp đồng cung cấp bao bì cho chuỗi bán lẻ lớn', contacted: [] },
  NM13: { id: 'NM13', sector: 'Bao dệt PP', cluster: 'woven', province: 'Đồng Nai', demand: 2200, source: 'mixed', eu: false, relation: 'customer', news: 'Báo chí đưa tin khó khăn do giá nguyên liệu tăng', contacted: ['buyer', 'foreman'] },
  NM28: { id: 'NM28', sector: 'Bao bì màng ghép thực phẩm', cluster: 'film', province: 'TP.HCM', demand: 21100, source: 'domestic', eu: false, relation: 'none', news: 'Đầu tư hệ thống thu hồi nhựa tái chế', contacted: ['buyer', 'qc'] },
};

export const SOURCE_LABEL: Record<Source, string> = { import: 'Nhập khẩu', mixed: 'Hỗn hợp', domestic: 'Trong nước' };
export const RELATION_LABEL: Record<FactoryInfo['relation'], string> = { none: 'Chưa tiếp cận', met: 'Đã gặp', trial: 'Đang mua thử', customer: 'Khách hàng hiện tại' };
export const CLUSTER_INFO: Record<ClusterId, { name: string; seminar: string }> = {
  film: { name: 'Màng ghép thực phẩm', seminar: 'Hội thảo “Giảm phế phẩm màng ghép”' },
  woven: { name: 'Bao dệt PP', seminar: 'Hội thảo “Bao dệt bền, ít đứt sợi”' },
  molding: { name: 'Chai lọ, sợi và dây đai', seminar: 'Hội thảo “Ổn định chỉ số chảy cho ép và kéo sợi”' },
};

export const ROLE_INFO: Record<RoleId, { name: string; short: string; kind: string }> = {
  foreman: { name: 'Quản đốc sản xuất', short: 'Quản đốc', kind: 'Người sử dụng' },
  qc: { name: 'Phòng QC', short: 'QC', kind: 'Người ảnh hưởng' },
  buyer: { name: 'Trưởng phòng mua hàng', short: 'Mua hàng', kind: 'Người mua' },
  cfo: { name: 'Giám đốc tài chính', short: 'Tài chính', kind: 'Kiểm soát ngân sách' },
  ceo: { name: 'Tổng giám đốc', short: 'TGĐ', kind: 'Người quyết định' },
};

export const THEME_INFO: Record<Theme, { pain: string; evidence: string; benefit: string; icon: string }> = {
  stock: { pain: 'Tồn kho, vốn chôn trong nguyên liệu', evidence: 'So sánh tồn kho 1–2 tuần với 4–6 tuần', benefit: 'Giao 48 giờ, tồn kho chỉ 1–2 tuần', icon: '📦' },
  tech: { pain: 'Máy chạy êm, ít phế phẩm', evidence: 'Kết quả chạy máy ở nhà máy cùng ngành', benefit: 'Kỹ sư ứng dụng có mặt trong 4 giờ', icon: '⚙️' },
  quality: { pain: 'Lô hàng ổn định, có chứng nhận', evidence: 'Phiếu kiểm nghiệm và chỉ số chảy 12 tháng', benefit: 'Phiếu kiểm nghiệm từng lô, dữ liệu 12 tháng', icon: '🧪' },
  fx: { pain: 'Rủi ro tỷ giá, trả bằng ngoại tệ', evidence: 'Bảng tính rủi ro tỷ giá một năm nhập khẩu', benefit: 'Thanh toán VND, giảm vốn lưu động', icon: '💱' },
  green: { pain: 'Hồ sơ xanh cho khách xuất khẩu EU', evidence: 'Số liệu phát thải và truy xuất nguồn gốc mẫu', benefit: 'Số liệu phát thải và truy xuất nguồn gốc', icon: '🌱' },
  price: { pain: 'Giá mua trên mỗi tấn', evidence: 'Lịch sử giá theo chỉ số thế giới', benefit: 'Cam kết giá theo chỉ số, bản tin hằng tuần', icon: '🏷️' },
};

export const INFLUENCE_LABEL: Record<Influence, string> = { 1: 'Thấp', 2: 'Vừa', 3: 'Cao' };

export const PRICE_INFO: Record<AbmPrice, { label: string; short: string; margin: number }> = {
  p3: { label: 'Giữ giá: cao hơn hàng nhập khẩu 3%', short: '+3%', margin: 0.08 },
  p15: { label: 'Cao hơn hàng nhập khẩu 1,5%', short: '+1,5%', margin: 0.065 },
  p0: { label: 'Ngang giá hàng nhập khẩu', short: '0%', margin: 0.05 },
  m2: { label: 'Phá giá: thấp hơn hàng nhập khẩu 2%', short: '−2%', margin: 0.03 },
};

export type ActivityKind = 'interview' | 'ai' | 'meet' | 'tco' | 'green' | 'visit' | 'trial' | 'seminar' | 'bulletin' | 'fair' | 'linkedin';
export const ACTIVITY_KINDS: ActivityKind[] = ['interview', 'ai', 'meet', 'tco', 'green', 'visit', 'trial', 'seminar', 'bulletin', 'fair', 'linkedin'];

export const ACTIVITY_INFO: Record<ActivityKind, { name: string; ap: number; cost: number; level: 'research' | '1:1' | '1:few' | '1:many'; effect: string }> = {
  interview: { name: 'Phỏng vấn một vai', ap: 1, cost: 0, level: 'research', effect: 'Lộ mức ảnh hưởng và nỗi đau số 1 của vai đó (lần hai: nỗi đau số 2). Chỉ mình bạn biết.' },
  ai: { name: 'Lập hồ sơ khách bằng AI', ap: 1, cost: 10, level: 'research', effect: 'Gợi ý nỗi đau của cả 5 vai, nhưng 1 gợi ý sai. Phỏng vấn để kiểm chứng.' },
  meet: { name: 'Gặp trực tiếp, mang 1 bằng chứng', ap: 2, cost: 10, level: '1:1', effect: 'Tăng quan hệ với vai đó. Bằng chứng đúng nỗi đau số 1: gấp đôi; lệch: một nửa.' },
  tco: { name: 'Báo cáo tổng chi phí riêng', ap: 2, cost: 20, level: '1:1', effect: 'Tồn kho, tỷ giá, phế phẩm quy ra tiền: tác động phòng mua hàng và giám đốc tài chính.' },
  green: { name: 'Hồ sơ phát thải và truy xuất', ap: 2, cost: 30, level: '1:1', effect: 'Tác động QC và Tổng giám đốc; mạnh ở nhà máy xuất EU.' },
  visit: { name: 'Mời tham quan nhà máy của bạn', ap: 2, cost: 50, level: '1:1', effect: 'Tác động Tổng giám đốc và một vai bạn chọn đi cùng.' },
  trial: { name: 'Chạy thử miễn phí 1 lô', ap: 3, cost: 150, level: '1:1', effect: 'Tác động mạnh quản đốc và QC. Mỗi nhà máy chỉ nhận 2 lô/tháng, ưu tiên nhà cung cấp quản đốc tin hơn.' },
  seminar: { name: 'Hội thảo kỹ thuật theo ngành', ap: 3, cost: 80, level: '1:few', effect: 'Tăng vừa phải quan hệ với quản đốc và QC mọi nhà máy cùng ngành.' },
  bulletin: { name: 'Bản tin giá và tỷ giá 1 trang', ap: 1, cost: 10, level: '1:few', effect: 'Tăng nhẹ với phòng mua hàng và tài chính ở tối đa 4 nhà máy.' },
  fair: { name: 'Hội chợ ngành và brochure', ap: 2, cost: 150, level: '1:many', effect: 'Tăng rất nhẹ với phòng mua hàng ở cả 8 nhà máy.' },
  linkedin: { name: 'Quảng cáo LinkedIn theo tên công ty', ap: 1, cost: 40, level: '1:many', effect: 'Tăng nhẹ với Tổng giám đốc và tài chính ở tối đa 3 nhà máy.' },
};
export const LEVEL_LABEL = { research: 'Tìm hiểu', '1:1': 'ABM 1:1', '1:few': 'ABM 1:vài', '1:many': '1:nhiều (đại trà)' } as const;

/** Access ("quy tắc mở cửa"): buyer and the contacted roles at once; QC/foreman from 1★, CFO/CEO from 2★ with any role there. */
export const ACCESS_STARS: Record<RoleId, number> = { buyer: 0, foreman: 1, qc: 1, cfo: 2, ceo: 2 };

export interface AbmAction {
  kind: ActivityKind;
  factory?: FactoryId;
  role?: RoleId;
  evidence?: Theme;
  cluster?: ClusterId;
  factories?: FactoryId[];
}

export type AbmSpecialChoice = 'discount' | 'tco' | 'cfo';
export const SPECIAL_INFO: Record<AbmSpecialChoice, string> = {
  discount: 'Đồng ý giảm 3% để ký (hồ sơ ở nhà máy này không chào cao hơn giá nhập khẩu được nữa)',
  tco: 'Gửi bảng tổng chi phí: tồn kho, tỷ giá, phế phẩm quy ra tiền',
  cfo: 'Đề nghị mời giám đốc tài chính cùng họp',
};

export interface AbmPlan {
  actions: AbmAction[];
  special?: AbmSpecialChoice;
}

export interface AbmBid {
  factory: FactoryId;
  price: AbmPrice;
  cards: Theme[];
}

export interface AbmSettings {
  /** Seconds per month; 0 = no limit (solo). Month 1 gets briefSec extra to read the factory cards. */
  monthSec: number;
  briefSec: number;
  bidSec: number;
  /** Seconds the results stay before the next round opens by itself; 0 = host presses next. */
  resultsSec: number;
  botLevel: BotLevel;
  fillBots: boolean;
}

export interface AbmPlayerPublic {
  id: string;
  name: string;
  bot: boolean;
  level?: BotLevel;
  archetype?: AbmArchetype;
  joinedAt: number;
  lms?: boolean;
}

export const ABM_ARCHETYPE_INFO: Record<AbmArchetype, string> = {
  fair: 'Hội chợ – brochure',
  spread: 'Rải đều',
  price: 'Giá thấp',
  tech: 'Chỉ lo kỹ thuật',
  abm: 'Tập trung ABM',
};

export interface AbmStanding {
  /** tỷ đồng */
  cost: number;
  gp: number;
  net: number;
  contracts: number;
  bids: number;
  rank: number;
  scorecard: number;
  defaulted?: boolean;
}

export interface AbmEventPublic {
  round: number;
  title: string;
  text: string;
}

export interface AbmBidResult {
  playerId: string;
  price: AbmPrice;
  score: number;
  rank: number;
  note: string;
}

export interface AbmAward {
  factory: FactoryId;
  winner: string | null;
  price: AbmPrice | null;
  /** tonnes in the trial contract */
  tonnes: number;
  /** tỷ đồng, first-year gross profit of the winner */
  gp: number;
  threshold: number;
  reason: string;
  bids: AbmBidResult[];
}

/** The hidden part, made public by the facilitator for the debrief. */
export interface AbmHiddenFactory {
  influence: Record<RoleId, Influence>;
  top: Record<RoleId, Theme[]>;
  threshold: number;
}

export type AbmStatus = 'lobby' | 'decide' | 'results' | 'finished';

export interface AbmRoomDoc {
  code: string;
  game: 'key-accounts';
  title: string;
  status: AbmStatus;
  createdAt: number;
  hostPlays: boolean;
  hostPlayerId: string | null;
  settings: AbmSettings;
  players: Record<string, AbmPlayerPublic>;
  order: string[];
  /** 1..3 months, 4 = bid round. */
  round: number;
  rounds: number;
  openedAt: number | null;
  deadline: number | null;
  event: AbmEventPublic | null;
  submitted: Record<string, boolean>;
  /** Who worked 1:1 on which factory last month (heat map, no detail). */
  heat: Partial<Record<FactoryId, string[]>>;
  news: string[];
  standings: Record<string, AbmStanding>;
  awards: AbmAward[] | null;
  hidden: Partial<Record<FactoryId, AbmHiddenFactory>> | null;
  revealedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  version: number;
  lmsStatus?: Record<string, 'sent' | 'error'>;
}

export interface AbmKnown {
  influence?: Influence;
  pain1?: Theme;
  pain2?: Theme;
  quote?: string;
  /** AI profile hint (may be wrong). */
  ai?: Theme;
  interviews?: number;
}

export interface AbmQuote {
  factory: FactoryId;
  role: RoleId;
  text: string;
}

export interface AbmMonthReport {
  round: number;
  plan: AbmPlan;
  defaulted: boolean;
  apUsed: number;
  /** triệu đồng */
  cost: number;
  lines: string[];
  quotes: AbmQuote[];
  /** Change of stars this month (after decay). */
  delta: Partial<Record<FactoryId, Partial<Record<RoleId, number>>>>;
}

export interface AbmSpecial {
  factory: FactoryId;
  title: string;
  text: string;
}

export interface AbmScorecard {
  reach: number;
  contracts: number;
  noDiscount: number;
  winRate: number;
  total: number;
  /** Factories where ≥ 3 roles are at ≥ 2★. */
  reachedFactories: number;
}

/** What /api/rooms/:code/abm-me returns to one player. */
export interface AbmMe {
  playerId: string;
  rel: Record<FactoryId, Record<RoleId, number>>;
  access: Record<FactoryId, Record<RoleId, boolean>>;
  known: Partial<Record<FactoryId, Partial<Record<RoleId, AbmKnown>>>>;
  reports: AbmMonthReport[];
  pending: AbmPlan | null;
  bids: AbmBid[] | null;
  special: AbmSpecial | null;
  /** Price caps from a promise made in month 3. */
  priceCap: Partial<Record<FactoryId, AbmPrice>>;
  /** triệu đồng, all months */
  costCum: number;
  scorecard: AbmScorecard;
  grade: number | null;
}

/** Tonnes and gross profit (tỷ đồng) of a won trial contract. */
export function contractValue(f: FactoryId, price: AbmPrice): { tonnes: number; gp: number } {
  const tonnes = Math.round(FACTORIES[f].demand * CONTRACT_SHARE);
  return { tonnes, gp: Math.round(((tonnes * PRICE_PER_TONNE * PRICE_INFO[price].margin) / 1000) * 100) / 100 };
}

/** AP and money of a plan (money in triệu đồng). */
export function planCost(plan: AbmPlan): { ap: number; cost: number } {
  let ap = 0;
  let cost = 0;
  for (const a of plan.actions) {
    ap += ACTIVITY_INFO[a.kind].ap;
    cost += ACTIVITY_INFO[a.kind].cost;
  }
  return { ap, cost };
}

/** Which roles a player can meet or interview, given their stars at a factory. */
export function accessOf(f: FactoryId, rel: Record<RoleId, number>): Record<RoleId, boolean> {
  const best = Math.max(...ROLES.map((r) => rel[r] ?? 0));
  const out = {} as Record<RoleId, boolean>;
  for (const r of ROLES) out[r] = FACTORIES[f].contacted.includes(r) || best >= ACCESS_STARS[r] - 1e-9;
  return out;
}
