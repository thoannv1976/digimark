// Game 3 plan and bid validation (shared by the API and the bots).
import { GameError } from '../room.js';
import {
  ACTIVITY_INFO,
  ACTIVITY_KINDS,
  AP_PER_MONTH,
  CARDS_PER_BID,
  CLUSTERS,
  FACTORY_IDS,
  MAX_BIDS,
  PRICES,
  ROLES,
  ROLE_INFO,
  THEMES,
  accessOf,
  type AbmAction,
  type AbmBid,
  type AbmPlan,
  type AbmSpecial,
  type AbmSpecialChoice,
  type FactoryId,
  type RoleId,
} from './types.js';

const FACTORY_KINDS = new Set(['interview', 'ai', 'meet', 'tco', 'green', 'visit', 'trial']);

export function validatePlan(raw: AbmPlan, rel: Record<FactoryId, Record<RoleId, number>>, special: AbmSpecial | null): AbmPlan {
  const actions: AbmAction[] = [];
  const seen = new Set<string>();
  let ap = 0;
  const list = Array.isArray(raw?.actions) ? raw.actions : [];
  if (list.length > 14) throw new GameError('bad_input', 'Quá nhiều hoạt động trong một tháng.');
  for (const a of list) {
    if (!ACTIVITY_KINDS.includes(a.kind)) throw new GameError('bad_input', 'Hoạt động không hợp lệ.');
    const out: AbmAction = { kind: a.kind };
    if (FACTORY_KINDS.has(a.kind)) {
      if (!a.factory || !FACTORY_IDS.includes(a.factory)) throw new GameError('bad_input', 'Chưa chọn nhà máy.');
      out.factory = a.factory;
    }
    if (a.kind === 'interview' || a.kind === 'meet') {
      if (!a.role || !ROLES.includes(a.role)) throw new GameError('bad_input', 'Chưa chọn vai trong nhóm mua.');
      if (!accessOf(a.factory!, rel[a.factory!])[a.role]) throw new GameError('locked', `Chưa gặp được ${ROLE_INFO[a.role].name} ở ${a.factory}: cần người giới thiệu (quan hệ ≥ ${a.role === 'cfo' || a.role === 'ceo' ? 2 : 1}★ với một vai ở đó).`);
      out.role = a.role;
    }
    if (a.kind === 'meet') {
      if (!a.evidence || !THEMES.includes(a.evidence)) throw new GameError('bad_input', 'Chưa chọn bằng chứng mang theo.');
      out.evidence = a.evidence;
    }
    if (a.kind === 'visit' && a.role) {
      if (!ROLES.includes(a.role)) throw new GameError('bad_input', 'Vai đi cùng không hợp lệ.');
      if (a.role !== 'ceo') out.role = a.role;
    }
    if (a.kind === 'seminar') {
      if (!a.cluster || !CLUSTERS.includes(a.cluster)) throw new GameError('bad_input', 'Chưa chọn ngành của hội thảo.');
      out.cluster = a.cluster;
    }
    if (a.kind === 'bulletin' || a.kind === 'linkedin') {
      const max = a.kind === 'bulletin' ? 4 : 3;
      const fs = Array.from(new Set(a.factories ?? [])).filter((f): f is FactoryId => FACTORY_IDS.includes(f));
      if (!fs.length || fs.length > max) throw new GameError('bad_input', `${ACTIVITY_INFO[a.kind].name}: chọn 1–${max} nhà máy.`);
      out.factories = fs;
    }
    const key =
      a.kind === 'interview' || a.kind === 'meet'
        ? `${a.kind}:${out.factory}:${out.role}`
        : FACTORY_KINDS.has(a.kind)
          ? `${a.kind}:${out.factory}`
          : a.kind === 'seminar'
            ? `seminar:${out.cluster}`
            : a.kind;
    if (seen.has(key)) throw new GameError('bad_input', `${ACTIVITY_INFO[a.kind].name}: mỗi tháng chỉ một lần${out.factory ? ` cho ${out.factory}` : ''}${out.role ? ` – ${ROLE_INFO[out.role].short}` : ''}.`);
    seen.add(key);
    ap += ACTIVITY_INFO[a.kind].ap;
    actions.push(out);
  }
  if (ap > AP_PER_MONTH) throw new GameError('over_ap', `Vượt điểm hành động: ${ap}/${AP_PER_MONTH}.`);
  let choice: AbmSpecialChoice | undefined;
  if (special) {
    if (!raw.special || !['discount', 'tco', 'cfo'].includes(raw.special)) throw new GameError('bad_input', `Chưa trả lời tin nhắn của ${special.factory}.`);
    choice = raw.special;
  }
  return { actions, ...(choice ? { special: choice } : {}) };
}

export function validateBids(raw: AbmBid[]): AbmBid[] {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > MAX_BIDS) throw new GameError('bad_input', `Tối đa ${MAX_BIDS} hồ sơ.`);
  const seen = new Set<string>();
  return list.map((b) => {
    if (!FACTORY_IDS.includes(b.factory)) throw new GameError('bad_input', 'Nhà máy không hợp lệ.');
    if (seen.has(b.factory)) throw new GameError('bad_input', `Mỗi nhà máy chỉ một hồ sơ (${b.factory}).`);
    seen.add(b.factory);
    if (!PRICES.includes(b.price)) throw new GameError('bad_input', `Chưa chọn giá cho ${b.factory}.`);
    const cards = Array.from(new Set(b.cards ?? [])).filter((c) => THEMES.includes(c));
    if (cards.length !== CARDS_PER_BID) throw new GameError('bad_input', `${b.factory}: chọn đúng ${CARDS_PER_BID} thẻ lợi ích.`);
    return { factory: b.factory, price: b.price, cards };
  });
}
