// Rule-based coaching notes after each quarter (no AI: every sentence follows from the numbers).
import { CARD_FACTOR, SEGMENT_MODEL } from './model.js';
import type { PlayerState } from './sim.js';
import { BUDGET_KEYS, CARD_INFO, QUARTER_BUDGET, SEGMENT_INFO, TARGETS, type MarketDecision, type QuarterKpis } from './types.js';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const ty = (v: number) => `${v.toFixed(1).replace('.', ',')} tỷ`;

export interface FeedbackInput {
  decision: MarketDecision;
  kpis: QuarterKpis;
  prevGp: number;
  player: PlayerState;
  quarter: number;
}

export function feedbackNotes({ decision: d, kpis: k, prevGp, player: p, quarter }: FeedbackInput): string[] {
  const notes: string[] = [];
  const b = d.budget;
  const used = BUDGET_KEYS.reduce((a, key) => a + b[key], 0);

  if (b.promo >= 0.6) {
    notes.push(`Khuyến mại chiếm ${pct(b.promo / QUARTER_BUDGET)} ngân sách: kéo khách nhạy giá nhưng lãi gộp mỗi khách bị bào mòn, và khách sẽ quen chờ giảm giá.`);
  }
  if (quarter > 1 && k.grossProfit < prevGp * 0.95) notes.push('Lãi gộp giảm hơn 5% so với quý trước: xem phân khúc nào mất khách trong bảng bên dưới.');
  if (b.ads >= 0.9 && p.crm < 0.2) {
    notes.push('Quảng cáo kéo khách đến nhưng chưa có CRM/Zalo OA để giữ: khách mới dễ rời đi khi bạn ngừng chi.');
  }
  if (b.maps === 0) {
    notes.push(`Không đầu tư Google Maps và trả lời đánh giá: điểm sao còn ${k.rating.toFixed(2).replace('.', ',')}. Với khách ô tô, Google Maps là “cửa hàng thứ hai”.`);
  }
  if (p.positionStreak === 1 && quarter > 1) {
    notes.push('Bạn vừa đổi định vị: khách chưa kịp nhớ lời hứa mới, điểm nhất quán bị đặt lại.');
  } else if (p.positionStreak >= 3) {
    notes.push(`Định vị “${CARD_INFO[d.position].name}” đã giữ ${p.positionStreak} quý: thương hiệu rõ ràng hơn trong đầu khách.`);
  }
  const factor = CARD_FACTOR[d.position];
  for (const s of d.targets) {
    const w = SEGMENT_MODEL[s].weights[factor];
    if (w < 0.08) notes.push(`Thẻ “${CARD_INFO[d.position].name}” ít liên quan tới điều phân khúc “${SEGMENT_INFO[s].name}” coi trọng.`);
  }
  if (d.targets.length === 0) notes.push('Chưa chọn phân khúc mục tiêu: ngân sách dàn trải cho mọi khách.');
  if (QUARTER_BUDGET - used >= 0.4) notes.push(`Còn ${ty(QUARTER_BUDGET - used)} ngân sách chưa dùng.`);
  if (k.nonfuelPct < TARGETS.nonfuelPct && quarter >= 2 && b.green === 0 && p.caps.green < 4) {
    notes.push(`Doanh thu ngoài nhiên liệu mới ${pct(k.nonfuelPct)} (mục tiêu ${pct(TARGETS.nonfuelPct)}): cần đổi pin, quầy tiện lợi.`);
  }
  if (k.repurchase < TARGETS.repurchase && b.crm === 0 && (d.targets.includes('households') || d.targets.includes('restaurants'))) {
    notes.push(`Nhắm khách gas nhưng không chi cho CRM: tỷ lệ mua lại ${pct(k.repurchase)}, mục tiêu ${pct(TARGETS.repurchase)}.`);
  }
  if (k.roi !== null) {
    if (k.roi < 0) notes.push(`ROI marketing so với lúc xuất phát: ${pct(k.roi)} – lãi gộp tăng thêm chưa bù được chi phí.`);
    else if (k.roi > 0.5) notes.push(`ROI marketing so với lúc xuất phát: ${pct(k.roi)} – chi tiêu đang tạo ra lãi gộp tăng thêm.`);
  }
  if (b.research === 0 && quarter === 1) notes.push('Bạn chưa mua nghiên cứu khách hàng: sở thích thật của các phân khúc vẫn là phỏng đoán.');
  return notes.slice(0, 5);
}
