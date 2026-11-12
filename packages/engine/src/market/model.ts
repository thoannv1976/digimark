// Server-only market model for Game 1 (true preferences, sizes, events). All money in tỷ đồng unless noted.
// Numbers are training assumptions loosely scaled from Case A (20 stores ≈ 14 M litres/quarter per chain).
import type { Capability, CardId, MarketEventOption, SegmentId } from './types.js';

export type Factor = Capability | 'price' | 'reviews';
export const FACTORS: Factor[] = ['speed', 'digital', 'service', 'trust', 'green', 'price', 'reviews'];

export interface SegmentModel {
  /** Customers in the whole city. */
  size: number;
  /** Per customer per quarter, triệu đồng. */
  revenue: number;
  grossProfit: number;
  /** Non-fuel revenue per customer per quarter at factor 1 (triệu đồng). */
  nonfuel: number;
  weights: Record<Factor, number>;
  /** How much paid awareness moves this segment (0..1). */
  paid: number;
  /** Base loyalty (share inertia) before CRM. */
  inertia: number;
  /** Size multiplier per quarter (trend). */
  trend: number;
}

export const SEGMENT_MODEL: Record<SegmentId, SegmentModel> = {
  riders: {
    size: 100_000, revenue: 7, grossProfit: 0.3, nonfuel: 0.12,
    weights: { speed: 0.28, digital: 0.27, service: 0.05, trust: 0.05, green: 0.1, price: 0.2, reviews: 0.05 },
    paid: 0.7, inertia: 0.35, trend: 0.97,
  },
  households: {
    size: 50_000, revenue: 1.4, grossProfit: 0.6, nonfuel: 0,
    weights: { speed: 0.22, digital: 0.18, service: 0.08, trust: 0.32, green: 0, price: 0.1, reviews: 0.1 },
    paid: 0.3, inertia: 0.55, trend: 1,
  },
  restaurants: {
    size: 5_000, revenue: 18, grossProfit: 5, nonfuel: 0,
    weights: { speed: 0.4, digital: 0.08, service: 0.14, trust: 0.22, green: 0, price: 0.12, reviews: 0.04 },
    paid: 0.2, inertia: 0.55, trend: 1,
  },
  cars: {
    size: 30_000, revenue: 20, grossProfit: 1.0, nonfuel: 0.5,
    weights: { speed: 0.08, digital: 0.1, service: 0.3, trust: 0.22, green: 0.05, price: 0.07, reviews: 0.18 },
    paid: 0.5, inertia: 0.45, trend: 1.01,
  },
  ev: {
    size: 15_000, revenue: 0, grossProfit: 0.3, nonfuel: 0.8,
    weights: { speed: 0.15, digital: 0.15, service: 0.1, trust: 0.05, green: 0.5, price: 0.05, reviews: 0 },
    paid: 0.5, inertia: 0.35, trend: 1.05,
  },
};

/** Which factor each positioning card promises. */
export const CARD_FACTOR: Record<CardId, Factor> = {
  fast: 'speed', loyalty: 'digital', safe: 'trust', green: 'green', fivestar: 'service', price: 'price',
};

export const START = {
  caps: { speed: 4, digital: 2, service: 3, trust: 4, green: 1 } as Record<Capability, number>,
  rating: 3.6,
  awareness: 30,
  /** Players' combined share of each segment at the start; the rest buys elsewhere. */
  playersShare: 0.6,
  repurchase: 0.57,
};

export const NONFUEL_MARGIN = 0.35;

// ───────── Events ─────────

export interface EventEffect {
  caps?: Partial<Record<Capability, number>>;
  rating?: number;
  awareness?: number;
  crm?: number;
  repurchase?: number;
  /** Attractiveness change per segment this quarter. */
  utility?: Partial<Record<SegmentId, number>>;
  /** Same, for the next quarter. */
  nextUtility?: Partial<Record<SegmentId, number>>;
  /** Effects applied at the start of the next quarter. */
  next?: { rating?: number; caps?: Partial<Record<Capability, number>>; news?: string };
  /** Gross profit multiplier for a segment this quarter. */
  gpFactor?: Partial<Record<SegmentId, number>>;
  /** From now on, keep this share of non-fuel margin (partner revenue share). */
  nonfuelKeep?: number;
  /** Points for the "phản hồi sự cố" target (0..25). */
  crisis?: number;
  /** Damage is reduced by the service capability (crisis). */
  softenedByService?: boolean;
  result: string;
}

export interface EventModelOption extends MarketEventOption {
  effect: EventEffect;
}

export interface MarketWide {
  sizeFactor?: Partial<Record<SegmentId, number>>;
  outside?: Partial<Record<SegmentId, number>>;
  /** Loyalty drop for gas customers unless CRM stock reaches the threshold. */
  churn?: { segments: SegmentId[]; drop: number; crmThreshold: number };
  news: string;
}

export interface EventModel {
  id: string;
  title: string;
  text: string;
  market?: MarketWide;
  options: EventModelOption[];
  /** Crisis that hits the market leader. */
  special?: { title: string; text: string; options: EventModelOption[] };
}

export const EVENTS: EventModel[] = [
  {
    id: 'e10',
    title: 'Xăng E10 bán trên toàn quốc',
    text: 'Từ quý này E10 có ở mọi cửa hàng. Khách liên tục hỏi “E10 có hại xe cũ không?”; nhiều đánh giá phàn nàn nhân viên không giải thích được.',
    market: { news: 'E10 bán toàn quốc: khách đổ xăng hỏi nhiều về độ an toàn cho xe đời cũ.' },
    options: [
      { id: 'train', label: 'Đào tạo nhân viên giải thích E10, đăng hỏi – đáp đã kiểm chứng trên Zalo OA', cost: 0.1, effect: { caps: { trust: 0.6, service: 0.3 }, result: 'Nhân viên trả lời được câu hỏi E10; khách ô tô tin tưởng hơn.' } },
      {
        id: 'overclaim', label: 'Chạy quảng cáo “E10 an toàn tuyệt đối cho 100% xe”', cost: 0.1,
        effect: { awareness: 10, next: { rating: -0.35, caps: { trust: -1 }, news: 'Khách phản ánh quảng cáo E10 “an toàn tuyệt đối” là hứa quá mức; đánh giá 1 sao tăng.' }, result: 'Quảng cáo lan nhanh… nhưng lời hứa tuyệt đối không có căn cứ.' },
      },
      { id: 'none', label: 'Không làm gì, chờ hãng xe lên tiếng', cost: 0, effect: { caps: { trust: -0.3 }, utility: { cars: -0.3, riders: -0.15 }, result: 'Khách băn khoăn E10 chuyển sang cửa hàng giải thích rõ hơn.' } },
    ],
  },
  {
    id: 'swap',
    title: 'Đối thủ lớn đặt 300 tủ đổi pin',
    text: 'Một chuỗi lớn ngoài thị trường ký đặt tủ đổi pin tại cây xăng. Số shipper chuyển sang xe điện tăng mạnh.',
    market: { sizeFactor: { ev: 1.3 }, outside: { ev: 0.4 }, news: 'Chuỗi lớn đặt 300 tủ đổi pin; phân khúc xe điện tăng 30%.' },
    options: [
      { id: 'build', label: 'Đặt tủ đổi pin ngay tại 10 cửa hàng', cost: 0.4, effect: { caps: { green: 2 }, result: 'Tủ đổi pin hoạt động từ quý này.' } },
      { id: 'partner', label: 'Hợp tác đối tác pin, chia doanh thu', cost: 0.1, effect: { caps: { green: 1.2 }, nonfuelKeep: 0.8, result: 'Có tủ đổi pin nhanh, đổi lại phải chia 20% lãi ngoài nhiên liệu.' } },
      { id: 'wait', label: 'Chờ thêm một quý xem thị trường', cost: 0, effect: { result: 'Khách xe điện tìm đến nơi có tủ đổi pin.' } },
    ],
  },
  {
    id: 'crisis',
    title: 'Video “bơm thiếu” lan truyền',
    text: 'Một video quay tại cửa hàng của chuỗi dẫn đầu thị phần tố trụ bơm thiếu, 50.000 lượt xem sau 1 giờ. Các chuỗi khác cũng bị khách hỏi.',
    market: { news: 'Video “bơm thiếu” tại cửa hàng của chuỗi dẫn đầu lan truyền trên mạng.' },
    options: [
      { id: 'review', label: 'Rà soát quy trình đồng hồ về 0 và kịch bản khủng hoảng của mình', cost: 0.05, effect: { caps: { trust: 0.3 }, crisis: 25, result: 'Sẵn sàng quy trình; khách thấy cửa hàng minh bạch.' } },
      { id: 'attack', label: 'Quảng cáo đá xoáy: “Cây xăng không bao giờ bơm thiếu”', cost: 0.1, effect: { awareness: 6, caps: { trust: -0.4 }, crisis: 5, result: 'Thu hút chú ý, nhưng lời hứa tuyệt đối làm khách nghi ngờ.' } },
      { id: 'none', label: 'Không làm gì', cost: 0, effect: { crisis: 15, result: 'Không có gì thay đổi.' } },
    ],
    special: {
      title: 'Khủng hoảng ở cửa hàng của bạn!',
      text: 'Video quay tại cửa hàng của BẠN, 50.000 lượt xem, trang tin địa phương hỏi ý kiến. Chưa có kết quả đo kiểm. Bạn làm gì trong giờ đầu?',
      options: [
        { id: 'own', label: 'Ghi nhận ngay, dừng trụ bơm, hẹn giờ công bố kết quả đo có chứng kiến', cost: 0.05, effect: { rating: -0.1, caps: { trust: 0.3 }, crisis: 25, softenedByService: true, result: 'Thông báo trong giờ đầu được đánh giá cao; thiệt hại nhỏ.' } },
        { id: 'wait', label: 'Im lặng, chờ có kết quả đo rồi mới nói', cost: 0, effect: { rating: -0.4, utility: { cars: -0.3 }, nextUtility: { cars: -0.2 }, crisis: 10, softenedByService: true, result: 'Sự im lặng bị hiểu là né tránh; khách ô tô rời đi.' } },
        { id: 'deny', label: 'Đăng bài phủ nhận: “Trụ bơm của chúng tôi luôn đúng”', cost: 0, effect: { rating: -0.5, caps: { trust: -1.5 }, next: { rating: -0.3, news: 'Camera cho thấy nhân viên không đưa đồng hồ về 0 – bài phủ nhận bị chụp lại lan truyền.' }, crisis: 0, softenedByService: true, result: 'Phủ nhận khi chưa kiểm tra; quý sau sự thật lộ ra.' } },
        { id: 'delete', label: 'Ẩn, xóa các bình luận chỉ trích', cost: 0, effect: { rating: -0.7, caps: { trust: -1 }, crisis: 0, softenedByService: true, result: 'Khách chụp màn hình việc xóa bình luận; điểm sao lao dốc.' } },
      ],
    },
  },
  {
    id: 'lez',
    title: 'Vùng phát thải thấp nội đô',
    text: 'Thành phố thí điểm vùng phát thải thấp; tài xế công nghệ chuyển sang xe điện nhanh hơn dự kiến.',
    market: { sizeFactor: { riders: 0.85, ev: 1.4 }, news: 'Vùng phát thải thấp: tài xế xe xăng giảm 15%, xe điện tăng 40%.' },
    options: [
      { id: 'ev', label: 'Biến 5 cửa hàng nội đô thành điểm đổi pin, sạc', cost: 0.3, effect: { caps: { green: 1.5 }, result: 'Cửa hàng nội đô đón khách xe điện.' } },
      { id: 'cars', label: 'Chuyển trọng tâm sang ô tô gia đình ven đô', cost: 0, effect: { utility: { cars: 0.25, riders: -0.15 }, result: 'Nhân viên và khuyến nghị dồn cho khách ô tô.' } },
      { id: 'none', label: 'Giữ nguyên', cost: 0, effect: { result: 'Không thay đổi.' } },
    ],
  },
  {
    id: 'churn',
    title: 'Khách gas rời đi âm thầm',
    text: 'Nhiều khách gas lâu năm quá 60 ngày chưa mua lại; tổng đài quá tải giờ nấu cơm chiều.',
    market: { churn: { segments: ['households', 'restaurants'], drop: 0.15, crmThreshold: 0.4 }, news: 'Khách gas rời đi âm thầm ở các chuỗi không có CRM nhắc mua lại.' },
    options: [
      { id: 'call', label: 'Gọi hỏi thăm khách có nguy cơ rời bỏ (F ≥ 4, R > 60 ngày), ưu đãi quay lại', cost: 0.05, effect: { utility: { households: 0.3, restaurants: 0.2 }, repurchase: 0.03, result: 'Nhiều khách quay lại và nói lý do rời đi.' } },
      { id: 'zalo', label: 'Mở đặt gas qua Zalo OA giờ cao điểm', cost: 0.15, effect: { caps: { speed: 0.6, digital: 0.4 }, result: 'Giảm tải tổng đài, khách đặt gas nhanh hơn.' } },
      { id: 'discount', label: 'Giảm giá gas 10% cho mọi khách', cost: 0.3, effect: { utility: { households: 0.25 }, gpFactor: { households: 0.9, restaurants: 0.9 }, result: 'Khách quay lại, nhưng lãi gộp gas giảm.' } },
      { id: 'none', label: 'Không làm gì', cost: 0, effect: { result: 'Không thay đổi.' } },
    ],
  },
];

/** Tuning knobs (checked by the balance simulation). */
export const TUNE = {
  beta: 1.5,
  capScale: 4,
  reviewScale: 3,
  fitScale: 2,
  paidScale: 1.2,
  targetBonus: 0.25,
  targetPaid: 1.3,
  untargetedPaid: 0.85,
  insightBonus: 0.15,
  promoPoints: 3,
  promoK: 0.5,
  promoMemory: 0.6,
  promoErosion: 0.03,
  awarenessDecay: 0.5,
  awarenessGain: 45,
  awarenessK: 0.8,
  awarenessFloor: 15,
  decay: { service: 0.3, trust: 0.15, rating: 0.15 },
  crmDecay: 0.1,
};
