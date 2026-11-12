import { describe, expect, it } from 'vitest';
import {
  ABM_ARCHETYPES,
  AP_PER_MONTH,
  FACTORY_IDS,
  MONTHS,
  BID_ROUND,
  ROLES,
  abmLmsResults,
  abmMe,
  advanceAbm,
  botBids,
  botPlan,
  botTargets,
  createAbmRoom,
  finishAbm,
  initAbm,
  joinAbm,
  openMonth,
  planCost,
  playAbm,
  resolveAwards,
  revealAbmHidden,
  scoreBid,
  seededRng,
  simulateMonth,
  specialFor,
  startAbm,
  submitAbmBids,
  submitAbmPlan,
  validateBids,
  validatePlan,
  type AbmPlan,
  type AbmPrivate,
  type AbmRoomDoc,
  type AbmState,
} from '../src/index.js';
import { ranked } from '../src/abm/model.js';

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

const noPlan: AbmPlan = { actions: [] };
const plainState = (ids: string[]): AbmState => {
  const s = initAbm(ids, seededRng('abm-test'));
  openMonth(s, 1);
  return s;
};

describe('Game 3 rules', () => {
  it('rejects plans over 10 AP, duplicates and locked roles', () => {
    const s = plainState(['a']);
    const rel = s.players.a!.rel;
    expect(() => validatePlan({ actions: [{ kind: 'trial', factory: 'NM05' }, { kind: 'trial', factory: 'NM19' }, { kind: 'trial', factory: 'NM22' }, { kind: 'trial', factory: 'NM25' }] }, rel, null)).toThrow(/điểm hành động/);
    expect(() => validatePlan({ actions: [{ kind: 'tco', factory: 'NM05' }, { kind: 'tco', factory: 'NM05' }] }, rel, null)).toThrow(/một lần/);
    // NM05: nobody has 2★ yet, so the CFO and CEO cannot be met.
    expect(() => validatePlan({ actions: [{ kind: 'meet', factory: 'NM05', role: 'cfo', evidence: 'stock' }] }, rel, null)).toThrow(/giới thiệu/);
    // ... but the buyer can, and the foreman is a contacted role.
    expect(validatePlan({ actions: [{ kind: 'meet', factory: 'NM05', role: 'buyer', evidence: 'price' }, { kind: 'interview', factory: 'NM05', role: 'foreman' }] }, rel, null).actions).toHaveLength(2);
    expect(() => validatePlan({ actions: [{ kind: 'bulletin', factories: ['NM05', 'NM19', 'NM22', 'NM17', 'NM25'] }] }, rel, null)).toThrow(/1–4/);
    expect(() => validateBids([{ factory: 'NM05', price: 'p3', cards: ['stock', 'tech'] }])).toThrow(/3 thẻ/);
    expect(() => validateBids(FACTORY_IDS.slice(0, 5).map((f) => ({ factory: f, price: 'p3' as const, cards: ['stock', 'tech', 'fx'] as const }).valueOf() as never))).toThrow(/Tối đa 4/);
  });

  it('interviews reveal the true top pain; the AI profile has exactly one wrong hint', () => {
    const s = plainState(['a']);
    simulateMonth(s, ['a'], { a: { plan: { actions: [{ kind: 'interview', factory: 'NM22', role: 'buyer' }, { kind: 'ai', factory: 'NM19' }] }, defaulted: false } }, { a: null }, 1, seededRng('x'));
    const k = s.players.a!.known;
    expect(k.NM22?.buyer?.pain1).toBe(ranked(s.hidden.NM22.pains.buyer)[0]);
    expect(k.NM22?.buyer?.influence).toBe(s.hidden.NM22.influence.buyer);
    const wrong = ROLES.filter((r) => k.NM19?.[r]?.ai !== ranked(s.hidden.NM19.pains[r])[0]);
    expect(wrong).toHaveLength(1);
  });

  it('matching evidence works twice as well; a factory takes only 2 trial batches a month', () => {
    const s = plainState(['a', 'b', 'c']);
    const top = ranked(s.hidden.NM05.pains.foreman)[0]!;
    const off = ranked(s.hidden.NM05.pains.foreman)[5]!;
    simulateMonth(
      s,
      ['a', 'b', 'c'],
      {
        a: { plan: { actions: [{ kind: 'meet', factory: 'NM05', role: 'foreman', evidence: top }, { kind: 'trial', factory: 'NM19' }] }, defaulted: false },
        b: { plan: { actions: [{ kind: 'meet', factory: 'NM05', role: 'foreman', evidence: off }, { kind: 'trial', factory: 'NM19' }] }, defaulted: false },
        c: { plan: { actions: [{ kind: 'trial', factory: 'NM19' }] }, defaulted: false },
      },
      { a: null, b: null, c: null },
      1,
      seededRng('t'),
    );
    const gainA = s.players.a!.rel.NM05.foreman - 1;
    const gainB = s.players.b!.rel.NM05.foreman - 1;
    expect(gainA).toBeGreaterThan(gainB * 2.5);
    const trialled = ['a', 'b', 'c'].filter((id) => s.players[id]!.rel.NM19.foreman > 0.6);
    expect(trialled).toHaveLength(2);
    const paid = ['a', 'b', 'c'].filter((id) => s.players[id]!.cost >= 150);
    expect(paid.sort()).toEqual(trialled.sort());
  });

  it('untended relationships decay, but never below the starting point', () => {
    const s = plainState(['a']);
    simulateMonth(s, ['a'], { a: { plan: { actions: [{ kind: 'meet', factory: 'NM22', role: 'buyer', evidence: 'price' }] }, defaulted: false } }, { a: null }, 1, seededRng('d'));
    const after1 = s.players.a!.rel.NM22.buyer;
    openMonth(s, 2);
    simulateMonth(s, ['a'], { a: { plan: noPlan, defaulted: true } }, { a: null }, 2, seededRng('d2'));
    expect(s.players.a!.rel.NM22.buyer).toBeCloseTo(Math.max(1, after1 - 0.25), 5);
    expect(s.players.a!.rel.NM13.buyer).toBe(2);
  });

  it('a discount promise caps the bid price; the award needs to beat the incumbent', () => {
    const s = plainState(['a', 'b']);
    s.players.a!.priceCap.NM05 = 'p0';
    const capped = scoreBid(s, 'a', { factory: 'NM05', price: 'p3', cards: ['stock', 'tech', 'quality'] });
    expect(capped.price).toBe('p0');
    const awards = resolveAwards(s, ['a', 'b'], { a: [{ factory: 'NM05', price: 'p3', cards: ['stock', 'tech', 'quality'] }], b: [] });
    const nm05 = awards.find((x) => x.factory === 'NM05')!;
    expect(nm05.winner).toBeNull(); // nobody has built anything yet
    expect(nm05.reason).toMatch(/ngưỡng/);
    // Max out every role: now it is a win, at the capped price.
    for (const r of ROLES) s.players.a!.rel.NM05[r] = 5;
    const win = resolveAwards(s, ['a', 'b'], { a: [{ factory: 'NM05', price: 'p3', cards: ['stock', 'tech', 'quality'] }], b: [] }).find((x) => x.factory === 'NM05')!;
    expect(win.winner).toBe('a');
    expect(win.price).toBe('p0');
    expect(win.tonnes).toBe(3450);
    expect(win.gp).toBeCloseTo(5.18, 2);
  });

  it('bot plans are always valid and within 10 AP', () => {
    for (const arch of ABM_ARCHETYPES) {
      for (const level of ['easy', 'medium', 'hard'] as const) {
        const ids = ['x', 'y'];
        const s = initAbm(ids, seededRng(`b:${arch}:${level}`));
        const rng = seededRng(`bots:${arch}:${level}`);
        const targets = botTargets(arch, level, rng);
        for (let m = 1; m <= MONTHS; m++) {
          openMonth(s, m);
          const sp = m === MONTHS ? specialFor(s, ids, 'x') : null;
          const plan = botPlan(arch, level, targets, s, 'x', m, sp, rng);
          expect(planCost(plan).ap).toBeLessThanOrEqual(AP_PER_MONTH);
          expect(() => validatePlan(plan, s.players.x!.rel, sp)).not.toThrow();
          simulateMonth(s, ids, { x: { plan, defaulted: false }, y: { plan: noPlan, defaulted: true } }, { x: sp, y: null }, m, rng);
        }
        expect(() => validateBids(botBids(arch, level, targets, s, 'x', rng))).not.toThrow();
      }
    }
  });
});

describe('Game 3 balance', () => {
  it('focus beats fairs and spreading; the good student usually wins against medium bots', () => {
    const N = 120;
    let student = 0;
    let fairContracts = 0;
    let spreadContracts = 0;
    let priceNet = 0;
    let abmNet = 0;
    for (let g = 0; g < N; g++) {
      const r = playAbm({ fair: { archetype: 'fair', level: 'medium' }, spread: { archetype: 'spread', level: 'medium' }, price: { archetype: 'price', level: 'medium' }, tech: { archetype: 'tech', level: 'medium' }, abm: { archetype: 'abm', level: 'medium' }, student: { archetype: 'abm', level: 'hard' } }, 300 + g);
      if (r.rank.student === 1) student++;
      fairContracts += r.contracts.fair!;
      spreadContracts += r.contracts.spread!;
      priceNet += r.net.price! / N;
      abmNet += r.net.abm! / N;
    }
    expect(student / N).toBeGreaterThan(0.45);
    expect(fairContracts / N).toBeLessThan(0.05);
    expect(spreadContracts / N).toBeLessThan(0.3);
    expect(abmNet).toBeGreaterThan(priceNet * 3);
  });
});

describe('Game 3 room', () => {
  function setup() {
    const rng = seededRng('room');
    const { room, priv, player } = createAbmRoom({ code: 'ABMX1', hostPlays: true, hostName: 'Lan', settings: { monthSec: 0 }, hostLms: { hubUserId: 'u1', gradeTarget: 'gt' } }, 1000, rng);
    const b = joinAbm(room, priv, 'Minh', 1000, rng);
    startAbm(room, priv, 2000, rng);
    return { room, priv, a: player!.playerId, b: b.playerId };
  }

  it('plays 3 months and the bid round; grades go to Moodle; hidden stays private until revealed', () => {
    const { room, priv, a, b } = setup();
    expect(room.order).toHaveLength(6);
    expect(room.status).toBe('decide');
    expect(room.deadline).toBeNull();
    let t = 3000;
    for (let m = 1; m <= MONTHS; m++) {
      expect(room.round).toBe(m);
      const me = abmMe(room, priv, a);
      const plan: AbmPlan = { actions: [{ kind: 'interview', factory: 'NM19', role: 'buyer' }, { kind: 'meet', factory: 'NM19', role: 'buyer', evidence: 'stock' }, { kind: 'tco', factory: 'NM19' }, { kind: 'trial', factory: 'NM19' }], ...(me.special ? { special: 'tco' as const } : {}) };
      expect(submitAbmPlan(room, priv, a, m, plan, t)).toBe(false);
      expect(room.submitted[a]).toBe(true);
      expect(submitAbmPlan(room, priv, b, m, { actions: [{ kind: 'fair' }], ...(abmMe(room, priv, b).special ? { special: 'discount' as const } : {}) }, t)).toBe(true);
      expect(room.status).toBe('results');
      expect(abmMe(room, priv, a).reports).toHaveLength(m);
      expect(room.heat.NM19).toContain(a);
      expect(JSON.stringify(room)).not.toContain('pains');
      expect(nestedArrayPath(room)).toBeNull();
      expect(nestedArrayPath(priv)).toBeNull();
      t += 1000;
      expect(advanceAbm(room, priv, t, { isHost: true, expectStatus: 'results', expectRound: m })).toBe(true);
    }
    expect(room.round).toBe(BID_ROUND);
    expect(() => submitAbmPlan(room, priv, a, BID_ROUND, noPlan, t)).toThrow();
    submitAbmBids(room, priv, a, BID_ROUND, [{ factory: 'NM19', price: 'p3', cards: ['quality', 'green', 'stock'] }], t);
    expect(() => revealAbmHidden(room, priv)).toThrow();
    submitAbmBids(room, priv, b, BID_ROUND, [{ factory: 'NM13', price: 'm2', cards: ['price', 'fx', 'stock'] }], t);
    expect(room.status).toBe('finished');
    expect(room.awards).toHaveLength(8);
    const ranks = room.order.map((id) => room.standings[id]!.rank).sort();
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6]);
    const res = abmLmsResults(room, priv);
    expect(res).toHaveLength(1);
    expect(res[0]!.comment).toContain('Săn hợp đồng');
    expect(res[0]!.score).toBe(abmMe(room, priv, a).grade);
    revealAbmHidden(room, priv);
    expect(Object.keys(room.hidden!)).toHaveLength(8);
    expect(nestedArrayPath(room)).toBeNull();
  });

  it('timer: missing plans default to nothing; host can end early and awards still happen', () => {
    const rng = seededRng('room2');
    const { room, priv, player } = createAbmRoom({ code: 'ABMX2', hostPlays: false, settings: { monthSec: 120, briefSec: 60 } }, 1000, rng);
    void player;
    const p = joinAbm(room, priv, 'An', 1000, rng);
    startAbm(room, priv, 2000, rng);
    expect(room.deadline).toBe(2000 + 180_000);
    expect(advanceAbm(room, priv, room.deadline! + 1, { isHost: false, expectStatus: 'decide', expectRound: 1 })).toBe(true);
    expect(room.standings[p.playerId]!.defaulted).toBe(true);
    expect(abmMe(room, priv, p.playerId).reports[0]!.defaulted).toBe(true);
    finishAbm(room, priv, 400_000);
    expect(room.status).toBe('finished');
    expect(room.awards).toHaveLength(8);
  });
});
