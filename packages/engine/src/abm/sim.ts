// Game 3 simulation: one month of approach activities, and the contract award. Pure functions.
import { shuffle, type Rng } from '../rng.js';
import {
  EVENTS,
  INFLUENCE_QUOTE,
  OVERSUPPLY_PRICE,
  PRICE_SENS,
  PRICE_SENS_FACTORY,
  PRICE_TERM,
  QUOTES,
  applyEventShift,
  makeHidden,
  ranked,
  startRel,
  type HiddenFactory,
} from './model.js';
import {
  ACTIVITY_INFO,
  CLUSTER_INFO,
  FACTORIES,
  FACTORY_IDS,
  INFLUENCE_LABEL,
  MAX_STARS,
  PRICES,
  PRICE_INFO,
  ROLES,
  ROLE_INFO,
  THEMES,
  THEME_INFO,
  TRIALS_PER_FACTORY,
  accessOf,
  contractValue,
  type AbmAward,
  type AbmBid,
  type AbmKnown,
  type AbmMonthReport,
  type AbmPlan,
  type AbmPrice,
  type AbmQuote,
  type AbmScorecard,
  type AbmSpecial,
  type FactoryId,
  type RoleId,
  type Theme,
} from './types.js';

export interface AbmPlayerState {
  rel: Record<FactoryId, Record<RoleId, number>>;
  known: Partial<Record<FactoryId, Partial<Record<RoleId, AbmKnown>>>>;
  /** triệu đồng */
  cost: number;
  priceCap: Partial<Record<FactoryId, AbmPrice>>;
}

export interface AbmState {
  round: number;
  hidden: Record<FactoryId, HiddenFactory>;
  players: Record<string, AbmPlayerState>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const stars = (v: number) => `${v.toFixed(1).replace('.', ',')}★`;

export function initAbm(order: string[], rng: Rng): AbmState {
  const players: Record<string, AbmPlayerState> = {};
  for (const id of order) {
    const rel = {} as Record<FactoryId, Record<RoleId, number>>;
    for (const f of FACTORY_IDS) rel[f] = startRel(f);
    players[id] = { rel, known: {}, cost: 0, priceCap: {} };
  }
  return { round: 0, hidden: makeHidden(rng), players };
}

/** Influence weights of a factory, summing to 1. */
export function weights(h: HiddenFactory): Record<RoleId, number> {
  const sum = ROLES.reduce((a, r) => a + h.influence[r], 0);
  const out = {} as Record<RoleId, number>;
  for (const r of ROLES) out[r] = h.influence[r] / sum;
  return out;
}

/** Relationship at a factory weighted by influence, in stars. */
export function weightedRel(h: HiddenFactory, rel: Record<RoleId, number>): number {
  const w = weights(h);
  return ROLES.reduce((a, r) => a + w[r] * rel[r], 0);
}

/** 1.5 when the activity speaks to the role's #1 pain, 1.0 for #2, 0.6 otherwise. */
function themeMult(pains: Record<Theme, number>, themes: Theme[]): number {
  const [a, b] = ranked(pains);
  if (themes.includes(a!)) return 1.5;
  if (themes.includes(b!)) return 1;
  return 0.6;
}

function meetMult(pains: Record<Theme, number>, evidence: Theme): number {
  const [a, b] = ranked(pains);
  return evidence === a ? 2 : evidence === b ? 1 : 0.5;
}

/** Diminishing returns: stars approach 6 (capped at 5), so each step up is harder. */
export function grow(cur: number, g: number): number {
  if (g <= 0) return cur;
  return Math.min(MAX_STARS, 6 - (6 - cur) * Math.exp(-g / 6));
}

export const DECAY = 0.25;

/** The month-3 offer "Giảm 3% thì ký ngay": the biggest factory where this player leads. */
export function specialFor(state: AbmState, order: string[], id: string): AbmSpecial | null {
  let best: FactoryId | null = null;
  for (const f of FACTORY_IDS) {
    const h = state.hidden[f];
    const mine = weightedRel(h, state.players[id]!.rel[f]);
    if (mine < 1.2) continue;
    const lead = order.every((o) => o === id || weightedRel(h, state.players[o]!.rel[f]) <= mine);
    if (!lead) continue;
    if (!best || FACTORIES[f].demand > FACTORIES[best].demand) best = f;
  }
  if (!best) return null;
  return {
    factory: best,
    title: `${best}: “Giảm 3% thì ký ngay”`,
    text: `Trưởng phòng mua hàng ${best} nhắn riêng: bạn đang được đánh giá cao nhất, nhưng “bên nhập khẩu vừa chào thấp hơn. Giảm 3% thì tôi trình ký ngay.” Bạn trả lời thế nào?`,
  };
}

export interface MonthInput {
  plan: AbmPlan;
  defaulted: boolean;
}

export interface MonthOutput {
  reports: Record<string, AbmMonthReport>;
  heat: Partial<Record<FactoryId, string[]>>;
  news: string[];
}

/** Applies the event pain shift for a month that is opening. */
export function openMonth(state: AbmState, round: number) {
  state.round = round;
  applyEventShift(state.hidden, round);
}

export function simulateMonth(
  state: AbmState,
  order: string[],
  inputs: Record<string, MonthInput>,
  specials: Record<string, AbmSpecial | null>,
  round: number,
  rng: Rng,
): MonthOutput {
  const gains: Record<string, Partial<Record<FactoryId, Partial<Record<RoleId, number>>>>> = {};
  const lines: Record<string, string[]> = {};
  const quotes: Record<string, AbmQuote[]> = {};
  const touched: Record<string, Set<FactoryId>> = {};
  const spend: Record<string, number> = {};
  const trialReq: Partial<Record<FactoryId, string[]>> = {};
  const before: Record<string, Record<FactoryId, Record<RoleId, number>>> = {};

  for (const id of order) {
    gains[id] = {};
    lines[id] = [];
    quotes[id] = [];
    touched[id] = new Set();
    spend[id] = 0;
    before[id] = JSON.parse(JSON.stringify(state.players[id]!.rel)) as Record<FactoryId, Record<RoleId, number>>;
  }

  const add = (id: string, f: FactoryId, r: RoleId, g: number, open: Record<RoleId, boolean>) => {
    let v = g * (open[r] ? 1 : 0.5);
    if (round === 1 && r === 'buyer') v *= 0.75;
    const m = (gains[id]![f] ??= {});
    m[r] = (m[r] ?? 0) + v;
  };

  for (const id of order) {
    const p = state.players[id]!;
    const access = {} as Record<FactoryId, Record<RoleId, boolean>>;
    for (const f of FACTORY_IDS) access[f] = accessOf(f, p.rel[f]);
    const { plan } = inputs[id]!;
    for (const a of plan.actions) {
      const info = ACTIVITY_INFO[a.kind];
      const f = a.factory;
      if (a.kind !== 'trial') spend[id]! += info.cost;
      if (f) touched[id]!.add(f);
      const h = f ? state.hidden[f] : null;
      switch (a.kind) {
        case 'interview': {
          const r = a.role!;
          add(id, f!, r, 0.3, access[f!]);
          const k = ((p.known[f!] ??= {})[r] ??= {});
          k.interviews = (k.interviews ?? 0) + 1;
          const [t1, t2] = ranked(h!.pains[r]);
          k.influence = h!.influence[r];
          k.pain1 = t1!;
          if (k.interviews >= 2) k.pain2 = t2!;
          k.quote = QUOTES[r][t1!];
          quotes[id]!.push({ factory: f!, role: r, text: `${QUOTES[r][t1!]} ${INFLUENCE_QUOTE[h!.influence[r]]}` });
          lines[id]!.push(
            `Phỏng vấn ${ROLE_INFO[r].name} ${f}: ảnh hưởng ${INFLUENCE_LABEL[h!.influence[r]].toLowerCase()}, nỗi đau số 1 “${THEME_INFO[t1!].pain}”${k.interviews >= 2 ? `, số 2 “${THEME_INFO[t2!].pain}”` : ''}.`,
          );
          break;
        }
        case 'ai': {
          const wrong = ROLES[Math.floor(rng() * ROLES.length)]!;
          const fk = (p.known[f!] ??= {});
          for (const r of ROLES) {
            const top = ranked(h!.pains[r])[0]!;
            let hint = top;
            if (r === wrong) {
              const others = THEMES.filter((t) => t !== top);
              hint = others[Math.floor(rng() * others.length)]!;
            }
            (fk[r] ??= {}).ai = hint;
          }
          lines[id]!.push(`Hồ sơ AI về ${f}: đã có gợi ý nỗi đau cho 5 vai (1 gợi ý sai, chưa biết là vai nào – phỏng vấn để kiểm chứng).`);
          break;
        }
        case 'meet': {
          const r = a.role!;
          const m = meetMult(h!.pains[r], a.evidence!);
          let g = 1 * m;
          if ((round === 2 && a.evidence === 'fx') || (round === 3 && a.evidence === 'green')) g *= 1.3;
          add(id, f!, r, g, access[f!]);
          lines[id]!.push(
            `Gặp ${ROLE_INFO[r].name} ${f} với “${THEME_INFO[a.evidence!].evidence}”: ${m >= 2 ? 'đúng điều họ lo nhất, buổi gặp rất hiệu quả' : m >= 1 ? 'họ quan tâm vừa phải' : 'họ nghe lịch sự nhưng không mấy hứng thú'}.`,
          );
          break;
        }
        case 'tco': {
          const g = round === 2 ? 1.3 : 1;
          add(id, f!, 'buyer', 0.8 * g * themeMult(h!.pains.buyer, ['stock', 'fx', 'price']), access[f!]);
          add(id, f!, 'cfo', 1.2 * g * themeMult(h!.pains.cfo, ['stock', 'fx']), access[f!]);
          lines[id]!.push(`Gửi báo cáo tổng chi phí cho ${f}${access[f!].cfo ? '' : ' (chưa gặp được giám đốc tài chính: báo cáo đến tay họ qua phòng mua hàng, hiệu quả một nửa)'}.`);
          break;
        }
        case 'green': {
          const g = (FACTORIES[f!].eu ? 1.3 : 1) * (round === 3 ? 1.3 : 1);
          add(id, f!, 'qc', 1 * g * themeMult(h!.pains.qc, ['green', 'quality']), access[f!]);
          add(id, f!, 'ceo', 1 * g * themeMult(h!.pains.ceo, ['green']), access[f!]);
          lines[id]!.push(`Gửi hồ sơ phát thải và truy xuất cho ${f}${FACTORIES[f!].eu ? ' (nhà máy xuất EU: rất được quan tâm)' : ''}.`);
          break;
        }
        case 'visit': {
          add(id, f!, 'ceo', 1.4, access[f!]);
          if (a.role && a.role !== 'ceo') add(id, f!, a.role, 0.8, access[f!]);
          lines[id]!.push(`Đón đoàn ${f} tham quan nhà máy${a.role && a.role !== 'ceo' ? ` (Tổng giám đốc và ${ROLE_INFO[a.role].name})` : ''}${access[f!].ceo ? '' : ' – chưa có người giới thiệu với Tổng giám đốc nên hiệu quả một nửa'}.`);
          break;
        }
        case 'trial':
          (trialReq[f!] ??= []).push(id);
          break;
        case 'seminar': {
          const fs = FACTORY_IDS.filter((x) => FACTORIES[x].cluster === a.cluster);
          for (const x of fs) {
            add(id, x, 'foreman', 0.6 * themeMult(state.hidden[x].pains.foreman, ['tech']), access[x]);
            add(id, x, 'qc', 0.3 * themeMult(state.hidden[x].pains.qc, ['quality', 'tech']), access[x]);
          }
          lines[id]!.push(`${CLUSTER_INFO[a.cluster!].seminar}: quản đốc và QC của ${fs.join(', ')} đến dự.`);
          break;
        }
        case 'bulletin': {
          const g = round === 2 ? 1.3 : 1;
          for (const x of a.factories ?? []) {
            add(id, x, 'buyer', 0.3 * g * themeMult(state.hidden[x].pains.buyer, ['price', 'fx']), access[x]);
            add(id, x, 'cfo', 0.3 * g * themeMult(state.hidden[x].pains.cfo, ['fx', 'price']), access[x]);
          }
          lines[id]!.push(`Gửi bản tin giá và tỷ giá cho ${(a.factories ?? []).join(', ')}.`);
          break;
        }
        case 'fair':
          for (const x of FACTORY_IDS) add(id, x, 'buyer', 0.15, access[x]);
          lines[id]!.push('Hội chợ ngành và brochure: phòng mua hàng của các nhà máy ghé gian hàng, nhận brochure.');
          break;
        case 'linkedin':
          for (const x of a.factories ?? []) {
            add(id, x, 'ceo', 0.25, access[x]);
            add(id, x, 'cfo', 0.25, access[x]);
          }
          lines[id]!.push(`Quảng cáo LinkedIn tới lãnh đạo ${(a.factories ?? []).join(', ')}.`);
          break;
      }
    }
    // Month-3 offer.
    const sp = specials[id];
    const choice = plan.special;
    if (sp && choice) {
      const f = sp.factory;
      const h = state.hidden[f];
      touched[id]!.add(f);
      const open = { ...access[f], cfo: true };
      if (choice === 'discount') {
        add(id, f, 'buyer', 1.2, open);
        p.priceCap[f] = 'p0';
        lines[id]!.push(`${f}: bạn hứa giảm 3%. Phòng mua hàng rất vui, nhưng hồ sơ thầu ở ${f} không chào cao hơn giá nhập khẩu được nữa.`);
      } else if (choice === 'tco') {
        add(id, f, 'buyer', 0.8 * themeMult(h.pains.buyer, ['stock', 'fx', 'price']), open);
        add(id, f, 'cfo', 1.2 * themeMult(h.pains.cfo, ['stock', 'fx']), open);
        lines[id]!.push(`${f}: bạn giữ giá và gửi bảng tổng chi phí. Phòng mua hàng có số liệu để trình sếp.`);
      } else {
        add(id, f, 'cfo', 1.2, open);
        add(id, f, 'buyer', 0.3, open);
        lines[id]!.push(`${f}: bạn giữ giá và mời giám đốc tài chính cùng họp – lần đầu nói chuyện tồn kho và tỷ giá với người giữ ngân sách.`);
      }
    }
  }

  // Trials: each factory takes 2 batches a month, the foreman picks suppliers they trust.
  for (const f of FACTORY_IDS) {
    const req = trialReq[f];
    if (!req?.length) continue;
    const sorted = shuffle(rng, req).sort((a, b) => state.players[b]!.rel[f].foreman - state.players[a]!.rel[f].foreman);
    sorted.forEach((id, i) => {
      if (i < TRIALS_PER_FACTORY) {
        const h = state.hidden[f];
        const open = accessOf(f, state.players[id]!.rel[f]);
        add(id, f, 'foreman', 1.5 * themeMult(h.pains.foreman, ['tech', 'quality']), open);
        add(id, f, 'qc', 1 * themeMult(h.pains.qc, ['quality', 'tech']), open);
        spend[id]! += ACTIVITY_INFO.trial.cost;
        lines[id]!.push(`Chạy thử 1 lô tại ${f}: máy chạy ổn, quản đốc và QC ghi nhận.`);
      } else {
        lines[id]!.push(`${f} đã nhận đủ ${TRIALS_PER_FACTORY} lô chạy thử của nhà cung cấp khác tháng này (quản đốc tin họ hơn). Lô của bạn bị từ chối, không mất tiền nhưng mất điểm hành động.`);
      }
    });
  }

  // Apply gains, then the decay of untouched roles.
  const reports: Record<string, AbmMonthReport> = {};
  const heat: Partial<Record<FactoryId, string[]>> = {};
  for (const id of order) {
    const p = state.players[id]!;
    for (const f of FACTORY_IDS) {
      const start = startRel(f);
      for (const r of ROLES) {
        const g = gains[id]![f]?.[r] ?? 0;
        if (g > 0) p.rel[f][r] = r2(grow(p.rel[f][r], g));
        else if (p.rel[f][r] > start[r]) p.rel[f][r] = r2(Math.max(start[r], p.rel[f][r] - DECAY));
      }
    }
    const delta: AbmMonthReport['delta'] = {};
    for (const f of FACTORY_IDS) {
      for (const r of ROLES) {
        const d = r2(p.rel[f][r] - before[id]![f][r]);
        if (Math.abs(d) >= 0.01) (delta[f] ??= {})[r] = d;
      }
    }
    for (const f of touched[id]!) (heat[f] ??= []).push(id);
    p.cost += spend[id]!;
    const { plan, defaulted } = inputs[id]!;
    const apUsed = plan.actions.reduce((a, x) => a + ACTIVITY_INFO[x.kind].ap, 0);
    if (defaulted) lines[id]!.unshift('Bạn không nộp kế hoạch tháng này: đội kinh doanh chỉ làm việc thường ngày, quan hệ không được chăm sóc sẽ giảm.');
    const decayed = FACTORY_IDS.flatMap((f) => {
      const rs = ROLES.filter((r) => (delta[f]?.[r] ?? 0) < 0);
      return rs.length ? [`${f} (${rs.map((r) => ROLE_INFO[r].short).join(', ')})`] : [];
    });
    if (decayed.length) lines[id]!.push(`Quan hệ giảm nhẹ với các vai tháng này không được chăm sóc: ${decayed.join('; ')}.`);
    reports[id] = { round, plan, defaulted, apUsed, cost: spend[id]!, lines: lines[id]!, quotes: quotes[id]!, delta };
  }
  const news = [EVENTS[round]?.news].filter((x): x is string => Boolean(x));
  const crowded = FACTORY_IDS.filter((f) => (heat[f]?.length ?? 0) >= 3);
  if (crowded.length) news.push(`Nhiều nhà cung cấp cùng theo ${crowded.join(', ')} – cạnh tranh ở đó sẽ gắt.`);
  return { reports, heat, news };
}

// ───────── Award ─────────

export interface BidScore {
  playerId: string;
  price: AbmPrice;
  score: number;
  rel: number;
  fit: number;
  priceTerm: number;
  parts: Record<RoleId, { rel: number; fit: number }>;
}

export function effectivePrice(p: AbmPlayerState, bid: AbmBid): AbmPrice {
  const cap = p.priceCap[bid.factory];
  if (!cap) return bid.price;
  return PRICES.indexOf(bid.price) < PRICES.indexOf(cap) ? cap : bid.price;
}

/** Score of one bid, 0..1 (shown ×100): Σ influence × (60% relationship + 40% fit) − price penalty. */
export function scoreBid(state: AbmState, id: string, bid: AbmBid): BidScore {
  const f = bid.factory;
  const h = state.hidden[f];
  const w = weights(h);
  const p = state.players[id]!;
  const price = effectivePrice(p, bid);
  const cards = Array.from(new Set(bid.cards));
  let rel = 0;
  let fit = 0;
  let pen = 0;
  const parts = {} as BidScore['parts'];
  for (const r of ROLES) {
    const relR = p.rel[f][r] / MAX_STARS;
    const fitR = Math.min(1, cards.reduce((a, c) => a + (h.pains[r][c] ?? 0), 0));
    rel += w[r] * 0.6 * relR;
    fit += w[r] * 0.4 * fitR;
    pen += w[r] * PRICE_SENS[r] * (PRICE_SENS_FACTORY[f] ?? 1) * PRICE_TERM[price] * OVERSUPPLY_PRICE;
    parts[r] = { rel: p.rel[f][r], fit: fitR };
  }
  const score = Math.round((rel + fit - pen) * 1000) / 1000;
  return { playerId: id, price, score, rel, fit, priceTerm: pen, parts };
}

const pts = (v: number) => Math.round(v * 100);

export function resolveAwards(state: AbmState, order: string[], bids: Record<string, AbmBid[]>): AbmAward[] {
  const awards: AbmAward[] = [];
  for (const f of FACTORY_IDS) {
    const h = state.hidden[f];
    const w = weights(h);
    const scored: BidScore[] = [];
    for (const id of order) {
      const b = (bids[id] ?? []).find((x) => x.factory === f);
      if (b) scored.push(scoreBid(state, id, b));
    }
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        PRICES.indexOf(b.price) - PRICES.indexOf(a.price) ||
        weightedRel(h, state.players[b.playerId]!.rel[f]) - weightedRel(h, state.players[a.playerId]!.rel[f]) ||
        order.indexOf(a.playerId) - order.indexOf(b.playerId),
    );
    const top = scored[0];
    const winner = top && top.score >= h.threshold ? top : null;
    const incumbent = FACTORIES[f].source === 'domestic' ? 'nhà cung cấp trong nước hiện tại' : FACTORIES[f].source === 'mixed' ? 'các nguồn hiện tại (nhập khẩu và trong nước)' : 'hàng nhập khẩu hiện tại';
    let reason: string;
    if (!scored.length) reason = `Không ai nộp hồ sơ. ${f} giữ ${incumbent}.`;
    else if (!winner) reason = `Không hồ sơ nào vượt ngưỡng ${pts(h.threshold)} điểm của ${incumbent} (cao nhất ${pts(top!.score)}). ${f} giữ nguồn cũ.`;
    else {
      const strong = ROLES.slice()
        .sort((a, b) => w[b] * winner.parts[b].rel - w[a] * winner.parts[a].rel)
        .slice(0, 2)
        .map((r) => `${ROLE_INFO[r].short} ${stars(winner.parts[r].rel)}`);
      const fitBest = ROLES.slice().sort((a, b) => w[b] * winner.parts[b].fit - w[a] * winner.parts[a].fit)[0]!;
      reason = `${pts(winner.score)} điểm, vượt ngưỡng ${pts(h.threshold)}. Mạnh nhờ quan hệ với ${strong.join(' và ')}; thẻ lợi ích khớp nhất với ${ROLE_INFO[fitBest].name}${winner.price === 'm2' ? '; chào thấp hơn hàng nhập khẩu 2%' : winner.price === 'p3' ? '; giữ được giá +3%' : ''}.`;
    }
    const results = scored.map((s, i) => {
      let note: string;
      if (winner && s.playerId === winner.playerId) note = 'Thắng hợp đồng thử.';
      else {
        const ref = winner ?? null;
        const gapRole = ROLES.slice().sort((a, b) => {
          const ga = w[a] * ((ref ? ref.parts[a].rel : MAX_STARS) - s.parts[a].rel);
          const gb = w[b] * ((ref ? ref.parts[b].rel : MAX_STARS) - s.parts[b].rel);
          return gb - ga;
        })[0]!;
        const lowFit = s.fit / 0.4 < 0.45;
        note = ref
          ? `Kém người thắng nhất ở ${ROLE_INFO[gapRole].name} (bạn ${stars(s.parts[gapRole].rel)}, người thắng ${stars(ref.parts[gapRole].rel)})${lowFit ? '; thẻ lợi ích chưa trúng nỗi đau' : ''}.`
          : `Chưa đủ ngưỡng: yếu nhất ở ${ROLE_INFO[gapRole].name} (${stars(s.parts[gapRole].rel)})${lowFit ? '; thẻ lợi ích chưa trúng nỗi đau' : ''}.`;
      }
      return { playerId: s.playerId, price: s.price, score: pts(s.score), rank: i + 1, note };
    });
    const value = winner ? contractValue(f, winner.price) : { tonnes: 0, gp: 0 };
    awards.push({ factory: f, winner: winner?.playerId ?? null, price: winner?.price ?? null, tonnes: value.tonnes, gp: value.gp, threshold: pts(h.threshold), reason, bids: results });
  }
  return awards;
}

// ───────── Score ─────────

export function reachedFactories(p: AbmPlayerState): number {
  return FACTORY_IDS.filter((f) => ROLES.filter((r) => p.rel[f][r] >= 2 - 1e-9).length >= 3).length;
}

/** "Mục tiêu ban lãnh đạo", scaled to 8 factories: 4 × 25 points. */
export function abmScorecard(p: AbmPlayerState, bids: AbmBid[] | null, wins: number | null): AbmScorecard {
  const reached = reachedFactories(p);
  const reach = 25 * Math.min(1, reached / 3);
  const n = bids?.length ?? 0;
  const w = wins ?? 0;
  const contracts = wins === null ? 0 : 12.5 * Math.min(2, w);
  // "Không giảm giá để giành khách": won at least one contract and no bid below the import price.
  const noDiscount = wins !== null && w > 0 && bids!.every((b) => effectivePrice(p, b) !== 'm2') ? 25 : 0;
  const winRate = wins !== null && n > 0 ? 25 * Math.min(1, w / n / 0.5) : 0;
  const r = (v: number) => Math.round(v * 10) / 10;
  return { reach: r(reach), contracts: r(contracts), noDiscount, winRate: r(winRate), total: r(reach + contracts + noDiscount + winRate), reachedFactories: reached };
}

export interface AbmRow {
  id: string;
  cost: number;
  gp: number;
  net: number;
  contracts: number;
  bids: number;
  scorecard: number;
  rank: number;
}

/** Ranking: gross profit of won contracts minus approach cost (tỷ đồng). */
export function abmRanking(state: AbmState, order: string[], bids: Record<string, AbmBid[]> | null, awards: AbmAward[] | null): Record<string, AbmRow> {
  const rows = order.map((id) => {
    const p = state.players[id]!;
    const won = (awards ?? []).filter((a) => a.winner === id);
    const gp = r2(won.reduce((a, x) => a + x.gp, 0));
    const cost = r2(p.cost / 1000);
    const sc = abmScorecard(p, bids?.[id] ?? null, awards ? won.length : null);
    return { id, cost, gp, net: r2(gp - cost), contracts: won.length, bids: bids?.[id]?.length ?? 0, scorecard: sc.total, rank: 0 };
  });
  rows.sort((a, b) => b.net - a.net || b.contracts - a.contracts || b.scorecard - a.scorecard || order.indexOf(a.id) - order.indexOf(b.id));
  const out: Record<string, AbmRow> = {};
  rows.forEach((r, i) => (out[r.id] = { ...r, rank: i + 1 }));
  return out;
}

