// Game 1 – Đấu trường Thị phần: public types and display content (data-free: the browser imports this).
// True segment preferences live in model.ts (server only).
import type { BotLevel } from '../types.js';

export type SegmentId = 'riders' | 'households' | 'restaurants' | 'cars' | 'ev';
export type CardId = 'fast' | 'loyalty' | 'safe' | 'green' | 'fivestar' | 'price';
export type BudgetKey = 'ads' | 'maps' | 'crm' | 'app' | 'training' | 'green' | 'promo' | 'research';
export type Capability = 'speed' | 'digital' | 'service' | 'trust' | 'green';
export type Archetype = 'price' | 'ads' | 'care' | 'green' | 'balanced';

export const SEGMENTS: SegmentId[] = ['riders', 'households', 'restaurants', 'cars', 'ev'];
export const CARDS: CardId[] = ['fast', 'loyalty', 'safe', 'green', 'fivestar', 'price'];
export const BUDGET_KEYS: BudgetKey[] = ['ads', 'maps', 'crm', 'app', 'training', 'green', 'promo', 'research'];
export const CAPABILITIES: Capability[] = ['speed', 'digital', 'service', 'trust', 'green'];

/** Budget per quarter, in tỷ đồng. Steps of 0.1 tỷ (100 triệu). */
export const QUARTER_BUDGET = 2;
export const BUDGET_STEP = 0.1;
export const STORES = 20;

export const SEGMENT_INFO: Record<SegmentId, { name: string; short: string; who: string; hint: string; channels: string }> = {
  riders: {
    name: 'Tài xế công nghệ',
    short: 'Tài xế',
    who: 'Xe máy chạy dịch vụ, đổ xăng gần như mỗi ngày.',
    hint: '“Tôi đổ chỗ nào nhanh nhất. Đổ cả năm mà chẳng được gì, tích điểm thì phải giữ thẻ giấy.”',
    channels: 'Mạng xã hội, nhóm tài xế, Google Maps',
  },
  households: {
    name: 'Hộ gia đình mua gas',
    short: 'Hộ gas',
    who: 'Hộ mua gas bình giao tận nhà (chuỗi A hiện có khoảng 18.000 hộ như vậy).',
    hint: '“Giá mấy hãng như nhau, tôi chỉ cần bình an toàn và có người nhắc khi sắp hết.”',
    channels: 'Zalo OA, tổng đài, ứng dụng',
  },
  restaurants: {
    name: 'Quán ăn, nhà hàng',
    short: 'Quán ăn',
    who: 'Ít khách nhưng mỗi khách dùng nhiều gas.',
    hint: '“Giờ trưa gọi tổng đài hoài không ai nhấc, hết gas giữa ca là mất khách.”',
    channels: 'Tổng đài, nhân viên kinh doanh, Zalo',
  },
  cars: {
    name: 'Chủ ô tô gia đình',
    short: 'Ô tô',
    who: 'Đổ xăng mỗi tuần, chọn cây xăng theo đánh giá và tiện ích.',
    hint: 'Đọc đánh giá Google Maps trước khi ghé; hỏi nhiều về E10 có hại xe không.',
    channels: 'Google Maps, đánh giá, mạng xã hội',
  },
  ev: {
    name: 'Shipper chuyển sang xe điện',
    short: 'Xe điện',
    who: 'Nhóm nhỏ nhưng tăng nhanh; không mua xăng, mua đổi pin và đồ uống.',
    hint: '“Tháng sau tôi chuyển xe điện rồi, cây xăng nào có đổi pin thì tôi vẫn ghé mua nước.”',
    channels: 'Nhóm tài xế, Zalo, Google Maps',
  },
};

export const CARD_INFO: Record<CardId, { name: string; promise: string }> = {
  fast: { name: 'Đổ nhanh nhất', promise: 'Vào – đổ – đi trong 3 phút; giao gas trong 30 phút.' },
  loyalty: { name: 'Tích điểm số', promise: 'Mỗi hóa đơn điện tử đều tích điểm trên Zalo/ứng dụng, không cần thẻ giấy.' },
  safe: { name: 'An toàn, nhắc lịch', promise: 'Gas an toàn, kiểm định rõ ràng; nhắc trước khi hết gas.' },
  green: { name: 'Trạm dừng xanh', promise: 'Đổi pin xe điện, cà phê, nghỉ chân ngay tại cây xăng.' },
  fivestar: { name: 'Cửa hàng 5 sao', promise: 'Sạch, thân thiện, nhân viên giải thích được E10, trả lời mọi đánh giá.' },
  price: { name: 'Giá tốt mỗi ngày', promise: 'Ưu đãi, giảm giá thường xuyên.' },
};

export const BUDGET_INFO: Record<BudgetKey, { name: string; peso: string; effect: string; trap: string }> = {
  ads: { name: 'Quảng cáo số', peso: 'Paid', effect: 'Tăng nhận biết ngay (Facebook, Zalo Ads, Google).', trap: 'Dừng chi là hiệu quả giảm một nửa mỗi quý.' },
  maps: { name: 'Google Maps & đánh giá', peso: 'Earned', effect: 'Chuẩn hóa hồ sơ, trả lời đánh giá trong 24 giờ: tăng điểm sao.', trap: 'Tác dụng chậm; bỏ trống thì điểm sao tụt.' },
  crm: { name: 'Zalo OA & CRM nhắc mua lại', peso: 'Owned', effect: 'Nhắc thay gas, hỏi thăm khách sắp rời: giữ khách, tăng mua lại.', trap: 'Cần tích lũy dữ liệu khách đã đồng ý qua nhiều quý.' },
  app: { name: 'Ứng dụng & tích điểm số', peso: 'Owned', effect: 'Năng lực số lâu dài: tích điểm theo hóa đơn điện tử, đặt gas online.', trap: 'Quý sau mới thấy hiệu quả.' },
  training: { name: 'Đào tạo nhân viên & trải nghiệm', peso: '—', effect: 'Dịch vụ, tin cậy, tốc độ; giảm thiệt hại khi có khủng hoảng.', trap: 'Không đào tạo thì năng lực dịch vụ mòn dần.' },
  green: { name: 'Đổi pin & quầy tiện lợi', peso: '—', effect: 'Hệ sinh thái xanh, doanh thu ngoài nhiên liệu.', trap: 'Đầu tư lớn, quý sau mới có hiệu quả.' },
  promo: { name: 'Khuyến mại giảm giá', peso: 'Paid', effect: 'Kéo khách nhạy giá ngay trong quý.', trap: 'Ăn vào lãi gộp; giảm giá liên tục làm khách quen giá thấp.' },
  research: { name: 'Nghiên cứu & dữ liệu', peso: '—', effect: 'Từ 100 triệu: lộ sở thích thật của phân khúc mục tiêu. Từ 300 triệu: thêm ngân sách quý trước của đối thủ.', trap: 'Không tạo doanh thu trực tiếp.' },
};

export const CAPABILITY_INFO: Record<Capability, string> = {
  speed: 'Tốc độ',
  digital: 'Số hóa & tích điểm',
  service: 'Trải nghiệm & dịch vụ',
  trust: 'An toàn & tin cậy',
  green: 'Hệ sinh thái xanh',
};

export const ARCHETYPE_INFO: Record<Archetype, string> = {
  price: 'Phá giá',
  ads: 'Đốt tiền quảng cáo',
  care: 'Chăm khách',
  green: 'Đi đầu xe điện',
  balanced: 'Cân bằng 70-20-10',
};

/** "Mục tiêu ban lãnh đạo 2027" from case A. */
export const TARGETS = { nonfuelPct: 0.03, repurchase: 0.65, rating: 4.3 } as const;
/** Starting points of the scorecard scales (case A today). */
export const START_RATING_FOR_SCORE = 3.6;
export const START_REPURCHASE = 0.57;

export interface MarketDecision {
  position: CardId;
  targets: SegmentId[];
  budget: Record<BudgetKey, number>;
  eventChoice?: string;
}

export interface MarketEventOption {
  id: string;
  label: string;
  /** tỷ đồng, taken from the quarter budget. */
  cost: number;
}

export interface MarketEventPublic {
  id: string;
  quarter: number;
  title: string;
  text: string;
  options: MarketEventOption[];
  /** The player hit by the crisis gets other options. */
  special?: { playerId: string; title: string; text: string; options: MarketEventOption[] };
}

export interface MarketSettings {
  quarters: number;
  /** Seconds for decisions; 0 = no limit (solo). */
  decideSec: number;
  /** Seconds the results stay before the next quarter opens by itself; 0 = host presses next. */
  resultsSec: number;
  botLevel: BotLevel;
  fillBots: boolean;
}

export interface MarketPlayerPublic {
  id: string;
  name: string;
  bot: boolean;
  level?: BotLevel;
  archetype?: Archetype;
  joinedAt: number;
  lms?: boolean;
}

export interface MarketStanding {
  /** Share of all customers in the city (0..1). */
  share: number;
  rating: number;
  profitCum: number;
  valueIndex: number;
  rank: number;
  /** Last quarter decision fell back to the previous one (no submission). */
  defaulted?: boolean;
  scorecard: number;
}

export interface MarketHistoryRow {
  quarter: number;
  shares: Record<string, number>;
  outside: number;
}

export type MarketStatus = 'lobby' | 'decide' | 'results' | 'finished';

export interface MarketRoomDoc {
  code: string;
  game: 'market-share';
  title: string;
  status: MarketStatus;
  createdAt: number;
  hostPlays: boolean;
  hostPlayerId: string | null;
  settings: MarketSettings;
  players: Record<string, MarketPlayerPublic>;
  order: string[];
  quarter: number;
  quarters: number;
  openedAt: number | null;
  /** null = no time limit. */
  deadline: number | null;
  event: MarketEventPublic | null;
  submitted: Record<string, boolean>;
  standings: Record<string, MarketStanding>;
  history: MarketHistoryRow[];
  /** Market headlines of the last quarter. */
  news: string[];
  revealedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  version: number;
  lmsStatus?: Record<string, 'sent' | 'error'>;
}

export interface QuarterKpis {
  customers: number;
  newCustomers: number;
  share: number;
  segShares: Record<SegmentId, number>;
  segCustomers: Record<SegmentId, number>;
  revenue: number;
  grossProfit: number;
  nonfuelRevenue: number;
  nonfuelPct: number;
  spend: number;
  profit: number;
  /** (gross profit change vs last quarter − spend) / spend; null in quarter 1. */
  roi: number | null;
  cac: number | null;
  repurchase: number;
  rating: number;
  awareness: number;
  caps: Record<Capability, number>;
}

export interface QuarterReport {
  quarter: number;
  decision: MarketDecision;
  defaulted: boolean;
  kpis: QuarterKpis;
  notes: string[];
  insights: string[];
  eventResult?: string;
}

export interface Scorecard {
  nonfuel: number;
  repurchase: number;
  rating: number;
  crisis: number;
  total: number;
}

/** What /api/market/:code/me returns to one player. */
export interface MarketMe {
  playerId: string;
  reports: QuarterReport[];
  /** Current quarter decision already sent (can still be changed until the quarter closes). */
  pending: MarketDecision | null;
  /** Segment preferences revealed by research: segment → capability/price weights (0..1, rounded). */
  knownPrefs: Partial<Record<SegmentId, Record<string, number>>>;
  scorecard: Scorecard;
  grade: number | null;
}
