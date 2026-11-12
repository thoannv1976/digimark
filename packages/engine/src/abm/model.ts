// Game 3 hidden model (server only): who weighs how much in each buying committee and what hurts them.
// Derived from the public data of the sheet so the logic holds (EU export → green file matters, etc.).
import { randInt, type Rng } from '../rng.js';
import {
  FACTORIES,
  FACTORY_IDS,
  ROLES,
  THEMES,
  type FactoryId,
  type Influence,
  type RoleId,
  type Theme,
} from './types.js';

export type Pains = Record<Theme, number>;

export interface HiddenFactory {
  influence: Record<RoleId, Influence>;
  pains: Record<RoleId, Pains>;
  /** Score a bid must beat to replace the current supplier. */
  threshold: number;
}

const P = (w: Partial<Pains>): Pains => {
  const out = { stock: 0, tech: 0, quality: 0, fx: 0, green: 0, price: 0, ...w };
  const sum = THEMES.reduce((a, t) => a + out[t], 0);
  for (const t of THEMES) out[t] = Math.round((out[t] / sum) * 1000) / 1000;
  return out;
};

/** Base committee per factory (before the per-room shuffle). */
const BASE: Record<FactoryId, { influence: Record<RoleId, Influence>; pains: Record<RoleId, Partial<Pains>>; threshold: number }> = {
  // Expansion 2027, only the foreman knows C: the new line needs engineering support and a steady supply.
  NM05: {
    influence: { foreman: 3, qc: 1, buyer: 2, cfo: 2, ceo: 3 },
    pains: {
      foreman: { tech: 0.5, quality: 0.3, stock: 0.2 },
      qc: { quality: 0.5, tech: 0.3, stock: 0.2 },
      buyer: { price: 0.55, stock: 0.25, fx: 0.2 },
      cfo: { stock: 0.45, fx: 0.35, price: 0.2 },
      ceo: { tech: 0.4, stock: 0.35, quality: 0.25 },
    },
    threshold: 0.4,
  },
  // EU exporter hiring QC engineers: QC carries weight, green file matters to the CEO.
  NM19: {
    influence: { foreman: 2, qc: 3, buyer: 2, cfo: 2, ceo: 3 },
    pains: {
      foreman: { tech: 0.5, quality: 0.3, stock: 0.2 },
      qc: { quality: 0.45, green: 0.35, tech: 0.2 },
      buyer: { price: 0.5, stock: 0.3, fx: 0.2 },
      cfo: { fx: 0.4, stock: 0.4, price: 0.2 },
      ceo: { green: 0.45, quality: 0.35, stock: 0.2 },
    },
    threshold: 0.4,
  },
  // Bottles for export with a new food-safety certificate: lot-to-lot quality first.
  NM22: {
    influence: { foreman: 2, qc: 3, buyer: 2, cfo: 2, ceo: 2 },
    pains: {
      foreman: { quality: 0.45, tech: 0.35, stock: 0.2 },
      qc: { quality: 0.6, tech: 0.2, green: 0.2 },
      buyer: { price: 0.5, stock: 0.3, fx: 0.2 },
      cfo: { stock: 0.45, fx: 0.35, price: 0.2 },
      ceo: { quality: 0.5, stock: 0.3, green: 0.2 },
    },
    threshold: 0.4,
  },
  // Fibre and straps, mixed sources, EU export, expanding.
  NM17: {
    influence: { foreman: 2, qc: 2, buyer: 2, cfo: 2, ceo: 3 },
    pains: {
      foreman: { tech: 0.5, stock: 0.3, quality: 0.2 },
      qc: { quality: 0.45, green: 0.35, tech: 0.2 },
      buyer: { price: 0.5, fx: 0.25, stock: 0.25 },
      cfo: { fx: 0.45, stock: 0.35, price: 0.2 },
      ceo: { green: 0.4, stock: 0.35, tech: 0.25 },
    },
    threshold: 0.39,
  },
  // EU exporter with a big retail packaging contract: the CEO wants the green file and no stock-outs.
  NM25: {
    influence: { foreman: 2, qc: 2, buyer: 2, cfo: 2, ceo: 3 },
    pains: {
      foreman: { tech: 0.5, quality: 0.3, stock: 0.2 },
      qc: { green: 0.45, quality: 0.4, tech: 0.15 },
      buyer: { price: 0.5, stock: 0.3, fx: 0.2 },
      cfo: { stock: 0.45, fx: 0.35, price: 0.2 },
      ceo: { green: 0.45, stock: 0.35, quality: 0.2 },
    },
    threshold: 0.4,
  },
  // Woven bags for a retail chain: purchasing is strong, deliveries must not slip.
  NM20: {
    influence: { foreman: 2, qc: 1, buyer: 3, cfo: 2, ceo: 2 },
    pains: {
      foreman: { tech: 0.45, quality: 0.35, stock: 0.2 },
      qc: { quality: 0.6, tech: 0.4 },
      buyer: { price: 0.5, stock: 0.35, fx: 0.15 },
      cfo: { stock: 0.5, fx: 0.3, price: 0.2 },
      ceo: { stock: 0.45, quality: 0.35, price: 0.2 },
    },
    threshold: 0.4,
  },
  // Small, in trouble with raw-material prices: purchasing and finance decide, on price.
  NM13: {
    influence: { foreman: 1, qc: 1, buyer: 3, cfo: 3, ceo: 2 },
    pains: {
      foreman: { tech: 0.5, stock: 0.3, quality: 0.2 },
      qc: { quality: 0.6, tech: 0.4 },
      buyer: { price: 0.7, fx: 0.15, stock: 0.15 },
      cfo: { price: 0.45, fx: 0.35, stock: 0.2 },
      ceo: { price: 0.5, fx: 0.3, stock: 0.2 },
    },
    threshold: 0.38,
  },
  // The biggest, buying domestic already (VND, short lead time): C's usual advantages do not hurt anyone here.
  NM28: {
    influence: { foreman: 1, qc: 2, buyer: 3, cfo: 2, ceo: 3 },
    pains: {
      foreman: { tech: 0.5, quality: 0.3, stock: 0.2 },
      qc: { quality: 0.5, green: 0.3, tech: 0.2 },
      buyer: { price: 0.65, quality: 0.2, stock: 0.15 },
      cfo: { price: 0.5, stock: 0.35, fx: 0.15 },
      ceo: { green: 0.55, quality: 0.3, price: 0.15 },
    },
    threshold: 0.66,
  },
};

/** Price sensitivity of each role at the award (multiplies the price term). */
export const PRICE_SENS: Record<RoleId, number> = { buyer: 1, cfo: 0.6, ceo: 0.3, foreman: 0.1, qc: 0.1 };
export const PRICE_SENS_FACTORY: Partial<Record<FactoryId, number>> = { NM13: 1.4, NM28: 1.25 };
export const PRICE_TERM = { p3: 0.2, p15: 0.12, p0: 0.06, m2: 0 } as const;
/** Oversupply (month 1 event) keeps purchasing focused on price until the award. */
export const OVERSUPPLY_PRICE = 1.15;

export const ranked = (p: Pains): Theme[] => THEMES.slice().sort((a, b) => p[b] - p[a] || THEMES.indexOf(a) - THEMES.indexOf(b));

/** Per-room copy of the hidden model with a light shuffle, so one class cannot hand the answers to the next. */
export function makeHidden(rng: Rng): Record<FactoryId, HiddenFactory> {
  const out = {} as Record<FactoryId, HiddenFactory>;
  for (const f of FACTORY_IDS) {
    const base = BASE[f];
    const influence = { ...base.influence };
    const pains = {} as Record<RoleId, Pains>;
    for (const r of ROLES) pains[r] = P(base.pains[r]);
    // Swap the two top pains of one role (not the purchasing manager: "giá trên mỗi tấn" stays true).
    if (rng() < 0.5) {
      const r = (['foreman', 'qc', 'cfo', 'ceo'] as RoleId[])[randInt(rng, 4)]!;
      const [a, b] = ranked(pains[r]);
      const t = pains[r][a!];
      pains[r][a!] = pains[r][b!];
      pains[r][b!] = t;
    }
    // Move one influence by one step (CEO stays high where it is high).
    if (rng() < 0.4) {
      const r = (['foreman', 'qc', 'cfo'] as RoleId[])[randInt(rng, 3)]!;
      const up = rng() < 0.5;
      influence[r] = Math.min(3, Math.max(1, influence[r] + (up ? 1 : -1))) as Influence;
    }
    out[f] = { influence, pains, threshold: base.threshold };
  }
  return out;
}

/** Stars every supplier starts with (the sheet's "Quan hệ hiện tại" and contacted roles; all six start equal). */
export function startRel(f: FactoryId): Record<RoleId, number> {
  const info = FACTORIES[f];
  const rel: Record<RoleId, number> = { foreman: 0, qc: 0, buyer: 0, cfo: 0, ceo: 0 };
  if (info.relation === 'met') rel.buyer = 0.5;
  if (info.relation === 'trial') {
    rel.buyer = 1;
    rel.foreman = 0.5;
  }
  if (info.relation === 'customer') {
    rel.buyer = 2;
    rel.foreman = 1.5;
  }
  for (const r of info.contacted) rel[r] = Math.max(rel[r], 1);
  return rel;
}

/** Month events (from the case file). */
export const EVENTS: Record<number, { title: string; text: string; news: string }> = {
  1: {
    title: 'Thị trường khu vực dư cung',
    text: 'Hàng nhập khẩu giảm thêm 2%. Phòng mua hàng các nhà máy ép giá mạnh hơn và ít muốn nghe chuyện khác giá.',
    news: 'Dư cung: phòng mua hàng khó gặp hơn (hiệu quả với phòng mua hàng giảm 1/4 trong tháng này), và sẽ soi giá kỹ hơn khi xét hồ sơ.',
  },
  2: {
    title: 'Tỷ giá USD tăng 2,5%',
    text: 'Nhà máy nhập khẩu phải trả thêm cho lô hàng đã đặt. Giám đốc tài chính càng lo vốn tồn kho và rủi ro tỷ giá.',
    news: 'Tỷ giá tăng: giám đốc tài chính ở các nhà máy nhập khẩu lo tỷ giá hơn; hoạt động nói về tỷ giá hiệu quả hơn 30% tháng này.',
  },
  3: {
    title: 'Khách EU hỏi số liệu phát thải (CBAM)',
    text: 'Khách châu Âu của các nhà máy xuất khẩu yêu cầu số liệu phát thải và truy xuất nguồn gốc nguyên liệu.',
    news: 'CBAM: QC và Tổng giám đốc ở nhà máy xuất EU coi trọng hồ sơ xanh hơn; hồ sơ phát thải hiệu quả hơn 30% tháng này.',
  },
};

/** Pain shifts that come with the events (applied when the month opens, kept afterwards). */
export function applyEventShift(hidden: Record<FactoryId, HiddenFactory>, round: number) {
  const bump = (p: Pains, t: Theme, by: number) => {
    p[t] += by;
    const sum = THEMES.reduce((a, x) => a + p[x], 0);
    for (const x of THEMES) p[x] = Math.round((p[x] / sum) * 1000) / 1000;
  };
  for (const f of FACTORY_IDS) {
    const info = FACTORIES[f];
    if (round === 2 && info.source !== 'domestic') bump(hidden[f].pains.cfo, 'fx', 0.15);
    if (round === 3 && info.eu) {
      bump(hidden[f].pains.qc, 'green', 0.15);
      bump(hidden[f].pains.ceo, 'green', 0.15);
    }
  }
}

/** Interview quotes, per role and top pain (pre-written: no AI during play). */
export const QUOTES: Record<RoleId, Record<Theme, string>> = {
  foreman: {
    tech: 'Lô nhập khẩu vừa rồi chạy máy hay đứt màng, phế phẩm tăng mà phòng mua hàng không tính vào đâu.',
    quality: 'Mỗi lô một kiểu, tôi phải chỉnh nhiệt lại cả ca. Tôi cần lô sau giống lô trước.',
    stock: 'Hàng về trễ là máy đứng. Kho thì chật vì phải ôm 6 tuần nguyên liệu.',
    fx: 'Tôi không rành tỷ giá, nhưng tháng nào giá về cao là bị cắt bớt vật tư.',
    green: 'Khách hỏi giấy tờ nguồn gốc, tôi chỉ biết chuyển cho phòng QC.',
    price: 'Giá thì phòng mua hàng lo, tôi chỉ cần máy chạy.',
  },
  qc: {
    quality: 'Chỉ số chảy lệch giữa các lô là chúng tôi phải giữ hàng lại kiểm. Phiếu kiểm nghiệm đầy đủ thì đỡ hẳn.',
    green: 'Khách châu Âu bắt đầu hỏi số liệu phát thải và nguồn gốc hạt nhựa. Chưa ai đưa được cho tôi.',
    tech: 'Phế phẩm cao thì QC bị hỏi trước. Có kỹ sư đứng máy cùng thì khác.',
    stock: 'Nguyên liệu để lâu trong kho ẩm, có lô phải sấy lại.',
    fx: 'Chuyện tiền tôi không quyết.',
    price: 'Rẻ mà không ổn định thì tôi không ký biên bản nhận hàng.',
  },
  buyer: {
    price: 'Tôi được đánh giá bằng giá mua trên mỗi tấn. Chênh 3% là tôi phải giải trình.',
    stock: 'Đặt hàng nhập phải tính trước 6 tuần, lệch dự báo là thiếu hoặc ôm kho.',
    fx: 'Mỗi lần thanh toán bằng đô là một lần hồi hộp với tỷ giá.',
    quality: 'Đổi nhà cung cấp mà lô đầu hỏng thì người chịu là tôi.',
    tech: 'Bên sản xuất cứ kêu đứt màng, nhưng tôi không có số liệu để cãi với sếp.',
    green: 'Hồ sơ xanh thì sếp mới hỏi gần đây.',
  },
  cfo: {
    stock: 'Tồn kho 6 tuần nguyên liệu là một khoản vốn lớn, lại chịu tỷ giá.',
    fx: 'Tỷ giá tăng một chút là lãi quý đi một khoản. Trả bằng VND thì tôi ngủ ngon hơn.',
    price: 'Tôi nhìn giá thành sản phẩm. Ai chứng minh được tổng chi phí thấp hơn thì tôi nghe.',
    quality: 'Hàng lỗi bị trả về mới là khoản lỗ lớn nhất.',
    tech: 'Phế phẩm là tiền, nhưng chưa ai quy ra tiền cho tôi xem.',
    green: 'Nếu mất khách EU vì thiếu hồ sơ thì thiệt hơn nhiều so với vài phần trăm giá.',
  },
  ceo: {
    green: 'Khách EU là khách tốt nhất của chúng tôi. Tôi cần nhà cung cấp giúp tôi giữ họ.',
    quality: 'Uy tín với khách lớn quan trọng hơn mọi thứ. Một lô lỗi là mất cả năm xây dựng.',
    stock: 'Dây chuyền mới chạy năm sau, tôi cần nguồn hàng chắc, không lệ thuộc tàu biển.',
    tech: 'Dây chuyền mới cần người hiểu máy đứng cạnh trong những tháng đầu.',
    price: 'Giá nguyên liệu đang bóp nghẹt chúng tôi. Ai giúp tôi qua giai đoạn này, tôi nhớ.',
    fx: 'Rủi ro tỷ giá là thứ tôi muốn bỏ khỏi bảng cân đối.',
  },
};

export const INFLUENCE_QUOTE: Record<Influence, string> = {
  3: 'Trong hội đồng, ý kiến của vai này gần như quyết định.',
  2: 'Vai này được hỏi ý kiến trước khi ký, có thể phủ quyết.',
  1: 'Vai này góp ý nhưng ít khi quyết định.',
};
