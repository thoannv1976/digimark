import { describe, expect, it } from 'vitest';
import {
  BUDGET_KEYS,
  SMART,
  advanceMarket,
  createMarketRoom,
  emptyBudget,
  finishMarket,
  gradeOf,
  initMarket,
  joinMarket,
  marketLmsResults,
  marketMe,
  playGame,
  seededRng,
  startMarket,
  submitDecision,
  validateDecision,
  type MarketDecision,
  type MarketPrivate,
  type MarketRoomDoc,
  type Strategy,
} from '../src/index.js';

function nestedArrayPath(v: unknown, path = '$'): string | null {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (Array.isArray(v[i])) return `${path}[${i}]`;
      const inner = nestedArrayPath(v[i], `${path}[${i}]`);
      if (inner) return inner;
    }
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const inner = nestedArrayPath(x, `${path}.${k}`);
      if (inner) return inner;
    }
  }
  return null;
}

const decision = (room: MarketRoomDoc, pid: string, over: Partial<MarketDecision> = {}): MarketDecision => {
  const budget = { ...emptyBudget(), maps: 0.3, training: 0.3, crm: 0.3, app: 0.3, ads: 0.3 };
  const special = room.event?.special?.playerId === pid ? room.event.special : null;
  const options = special ? special.options : room.event?.options;
  return { position: 'fivestar', targets: ['cars', 'households'], budget, ...(options ? { eventChoice: options[0]!.id } : {}), ...over };
};

function soloRoom(settings: Record<string, unknown> = {}) {
  const rng = seededRng('m');
  const made = createMarketRoom({ code: 'MKT01', hostPlays: true, hostName: 'Lan', settings: { decideSec: 0, ...settings } }, 0, rng);
  return { ...made, rng };
}

describe('market model', () => {
  it('starts every chain level and keeps shares within the market', () => {
    const st = initMarket(['a', 'b', 'c']);
    expect(st.players.a!.shares.riders).toBeCloseTo(0.1);
    expect(st.players.a!.baselineGp).toBeGreaterThan(5);
  });

  it('is deterministic for the same seed', () => {
    const lineup: Record<string, Strategy> = { s: SMART, p: { kind: 'bot', archetype: 'price', level: 'medium' }, g: { kind: 'bot', archetype: 'green', level: 'easy' } };
    expect(playGame(lineup, 42)).toEqual(playGame(lineup, 42));
  });

  it('balance: price-cutting and ad-burning never win; the taught strategy usually does', () => {
    const lineup: Record<string, Strategy> = {
      price: { kind: 'bot', archetype: 'price', level: 'medium' },
      ads: { kind: 'bot', archetype: 'ads', level: 'medium' },
      care: { kind: 'bot', archetype: 'care', level: 'medium' },
      green: { kind: 'bot', archetype: 'green', level: 'medium' },
      balanced: { kind: 'bot', archetype: 'balanced', level: 'medium' },
      smart: SMART,
    };
    const wins: Record<string, number> = {};
    let smartRank = 0;
    const n = 60;
    for (let g = 0; g < n; g++) {
      const r = playGame(lineup, 900 + g);
      for (const [id, rank] of Object.entries(r.ranks)) if (rank === 1) wins[id] = (wins[id] ?? 0) + 1;
      smartRank += r.ranks.smart! / n;
      for (const v of Object.values(r.grades)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
    expect(wins.price ?? 0).toBe(0);
    expect(wins.ads ?? 0).toBe(0);
    expect(smartRank).toBeLessThan(1.6);
  });

  it('grade = 70% scorecard + 30% rank', () => {
    expect(gradeOf(100, 1, 6)).toBe(100);
    expect(gradeOf(100, 6, 6)).toBe(70);
    expect(gradeOf(50, 3, 6)).toBe(53);
  });
});

describe('market room flow', () => {
  it('plays a solo game of 5 quarters against 5 bots and finishes with grades', () => {
    const { room, priv, player, rng } = soloRoom();
    startMarket(room, priv, 1000, rng);
    expect(room.order).toHaveLength(6);
    expect(new Set(Object.values(priv.archetypes)).size).toBe(5);
    let now = 2000;
    for (let q = 1; q <= 5; q++) {
      expect(room.status).toBe('decide');
      expect(room.deadline).toBeNull();
      if (q === 3) expect(room.event?.special?.playerId).toBeTruthy();
      const closed = submitDecision(room, priv, player!.playerId, q, decision(room, player!.playerId), now);
      expect(closed).toBe(true);
      expect(nestedArrayPath(room)).toBeNull();
      expect(nestedArrayPath(priv)).toBeNull();
      if (q < 5) {
        expect(room.status).toBe('results');
        expect(advanceMarket(room, priv, now + 999_999, { isHost: false })).toBe(false); // host moves on
        expect(advanceMarket(room, priv, now + 10, { isHost: true })).toBe(true);
      }
      now += 1000;
    }
    expect(room.status).toBe('finished');
    expect(room.history).toHaveLength(5);
    const me = marketMe(room, priv, player!.playerId);
    expect(me.reports).toHaveLength(5);
    expect(me.grade).not.toBeNull();
    expect(me.reports[0]!.notes.length).toBeGreaterThan(0);
    expect(Object.values(room.standings).map((s) => s.rank).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('validates decisions: budget, targets, event choice', () => {
    const { room, priv, player, rng } = soloRoom();
    startMarket(room, priv, 1000, rng);
    const pid = player!.playerId;
    const over = decision(room, pid, { budget: { ...emptyBudget(), ads: 2.1 } });
    expect(() => validateDecision(room, priv, pid, over)).toThrow(/Vượt ngân sách/);
    expect(() => validateDecision(room, priv, pid, decision(room, pid, { targets: ['cars', 'ev', 'riders'] }))).toThrow(/tối đa 2/);
    const noEvent = decision(room, pid);
    delete noEvent.eventChoice;
    expect(() => validateDecision(room, priv, pid, noEvent)).toThrow(/sự kiện/);
    const fine = validateDecision(room, priv, pid, decision(room, pid, { budget: { ...emptyBudget(), ads: 0.33333, maps: 0.26 } }));
    expect(fine.budget.ads).toBe(0.3);
    expect(fine.budget.maps).toBe(0.3);
    // event costs count against the budget
    const all = { ...emptyBudget(), ads: 2 };
    const costly = room.event!.options.find((o) => o.cost > 0)!;
    expect(() => validateDecision(room, priv, pid, { position: 'fast', targets: [], budget: all, eventChoice: costly.id })).toThrow(/Vượt/);
  });

  it('closes at the deadline and plays defaults for players who did not decide', () => {
    const rng = seededRng('d');
    const { room, priv } = createMarketRoom({ code: 'MKT02', hostPlays: false, settings: { decideSec: 120, fillBots: false } }, 0, rng);
    const a = joinMarket(room, priv, 'An', 1, rng);
    joinMarket(room, priv, 'Bình', 2, rng);
    startMarket(room, priv, 1000, rng);
    expect(room.order).toHaveLength(2);
    expect(submitDecision(room, priv, a.playerId, 1, decision(room, a.playerId), 2000)).toBe(false);
    expect(advanceMarket(room, priv, room.deadline! - 1, { isHost: false })).toBe(false);
    expect(advanceMarket(room, priv, room.deadline!, { isHost: false })).toBe(true);
    const defaulted = Object.entries(room.standings).filter(([, s]) => s.defaulted).map(([id]) => id);
    expect(defaulted).toHaveLength(1);
    expect(defaulted[0]).not.toBe(a.playerId);
    // auto-advance off: only the host opens the next quarter; resultsSec makes it automatic
    expect(room.status).toBe('results');
  });

  it('rejects joining after start and lets the host finish early', () => {
    const { room, priv, rng } = soloRoom();
    startMarket(room, priv, 1000, rng);
    expect(() => joinMarket(room, priv, 'Muộn', 5, rng)).toThrow(/đã bắt đầu/);
    finishMarket(room, priv, 3000);
    expect(room.status).toBe('finished');
    expect(room.history).toHaveLength(1);
  });

  it('sends a Moodle grade only for Moodle players with a gradebook column', () => {
    const rng = seededRng('lms');
    const { room, priv, player } = createMarketRoom({ code: 'MKT03', hostPlays: true, hostName: 'Chi', settings: { decideSec: 0 }, hostLms: { hubUserId: 'h1', gradeTarget: 'gt' } }, 0, rng);
    expect(room.players[player!.playerId]!.lms).toBe(true);
    startMarket(room, priv, 1000, rng);
    for (let q = 1; q <= 5; q++) {
      submitDecision(room, priv, player!.playerId, q, decision(room, player!.playerId), 2000 + q);
      if (q < 5) advanceMarket(room, priv, 3000 + q, { isHost: true });
    }
    const res = marketLmsResults(room, priv);
    expect(res).toHaveLength(1);
    expect(res[0]!.score).toBeGreaterThan(0);
    expect(res[0]!.comment).toContain('Đấu trường Thị phần');
    expect(BUDGET_KEYS).toHaveLength(8);
  });
});

export type { MarketPrivate };
