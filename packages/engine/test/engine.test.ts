import { describe, expect, it } from 'vitest';
import {
  AI_DETECTIVE_BANK,
  CATEGORIES,
  MAX_SEATS,
  WRONG_PENALTY,
  advance,
  computePoints,
  createRoom,
  finishGame,
  gradeFraction,
  isValidInput,
  joinRoom,
  planBotAnswer,
  preparePublic,
  ranking,
  seededRng,
  selectQuestions,
  speedFactor,
  startGame,
  submitAnswer,
  useHint,
  type AnswerInput,
  type AnswerKey,
  type RoomDoc,
  type RoomPrivate,
} from '../src/index.js';

const bank = AI_DETECTIVE_BANK;

describe('question bank', () => {
  it('has unique ids and well-formed answers', () => {
    const ids = new Set<string>();
    for (const q of bank) {
      expect(ids.has(q.id), q.id).toBe(false);
      ids.add(q.id);
      expect(q.explanation.length, q.id).toBeGreaterThan(10);
      if (q.kind === 'choice') {
        expect(q.options.length, q.id).toBeGreaterThanOrEqual(3);
        expect(q.answer, q.id).toBeGreaterThanOrEqual(0);
        expect(q.answer, q.id).toBeLessThan(q.options.length);
        expect(new Set(q.options).size, q.id).toBe(q.options.length);
      } else if (q.kind === 'spot') {
        expect(q.segments.length, q.id).toBeGreaterThanOrEqual(3);
        expect(q.answer.seg, q.id).toBeLessThan(q.segments.length);
      } else {
        expect(q.items.length, q.id).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('has enough questions in every category', () => {
    for (const c of CATEGORIES) expect(bank.filter((q) => q.category === c).length, c).toBeGreaterThanOrEqual(8);
    expect(bank.length).toBeGreaterThanOrEqual(60);
  });

  it('does not keep legal facts that contradict the course material', () => {
    const text = JSON.stringify(bank);
    // Correct facts the explanations rely on.
    expect(text).toContain('91/2025/QH15');
    expect(text).toContain('134/2025/QH15');
    expect(text).toContain('356/2025/NĐ-CP');
  });
});

describe('preparePublic', () => {
  it('maps the answer key through the shuffle', () => {
    for (const q of bank) {
      for (let s = 0; s < 5; s++) {
        const { pub, key } = preparePublic(q, seededRng(`${q.id}:${s}`));
        if (q.kind === 'choice' && key.kind === 'choice') {
          expect(pub.options?.[key.option]).toBe(q.options[q.answer]);
          if (q.fixedOrder) expect(pub.options).toEqual(q.options);
        }
        if (q.kind === 'order' && key.kind === 'order') {
          const shown = key.order.map((i) => pub.items?.[i]);
          expect(shown).toEqual(q.items);
          expect(pub.items).not.toEqual(q.items);
        }
        expect(JSON.stringify(pub)).not.toContain('"answer"');
      }
    }
  });
});

describe('scoring', () => {
  it('grades partial answers', () => {
    const spot: AnswerKey = { kind: 'spot', seg: 1, type: 'law' };
    expect(gradeFraction(spot, { kind: 'spot', seg: 1, type: 'law' })).toBe(1);
    expect(gradeFraction(spot, { kind: 'spot', seg: 1, type: 'date' })).toBe(0.6);
    expect(gradeFraction(spot, { kind: 'spot', seg: 0, type: 'law' })).toBe(0);
    const order: AnswerKey = { kind: 'order', order: [2, 0, 1, 3] };
    expect(gradeFraction(order, { kind: 'order', order: [2, 0, 1, 3] })).toBe(1);
    expect(gradeFraction(order, { kind: 'order', order: [0, 2, 1, 3] })).toBe(0.5);
    expect(gradeFraction({ kind: 'choice', option: 2 }, { kind: 'order', order: [0] })).toBe(0);
  });

  it('rewards speed, streaks and penalises wrong answers', () => {
    expect(speedFactor(0, 20000)).toBe(1);
    expect(speedFactor(20000, 20000)).toBe(0.5);
    const base = { answered: true, fraction: 1, elapsedMs: 0, limitMs: 20000, hint: false, streakBefore: 0 };
    expect(computePoints(base)).toBe(1000);
    expect(computePoints({ ...base, streakBefore: 3 })).toBe(1300);
    expect(computePoints({ ...base, streakBefore: 99 })).toBe(1500);
    expect(computePoints({ ...base, hint: true })).toBe(500);
    expect(computePoints({ ...base, fraction: 0 })).toBe(-WRONG_PENALTY);
    expect(computePoints({ ...base, answered: false, fraction: 0 })).toBe(0);
  });
});

describe('bots', () => {
  it('answer within the time limit with roughly the configured accuracy', () => {
    const q = bank.find((x) => x.kind === 'choice')!;
    const rng = seededRng('bots');
    let right = 0;
    const runs = 2000;
    for (let i = 0; i < runs; i++) {
      const { pub, key } = preparePublic(q, rng);
      const plan = planBotAnswer('hard', pub, key, 1000, rng);
      expect(plan.at).toBeGreaterThan(1000);
      expect(plan.at).toBeLessThan(1000 + pub.timeLimitSec * 1000);
      expect(isValidInput(pub, plan.input)).toBe(true);
      if (gradeFraction(key, plan.input) === 1) right++;
    }
    expect(right / runs).toBeGreaterThan(0.8);
    expect(right / runs).toBeLessThan(0.9);
  });

  it('produce valid wrong answers for every question kind', () => {
    const rng = seededRng('wrong');
    for (const q of bank) {
      const { pub, key } = preparePublic(q, rng);
      for (let i = 0; i < 20; i++) expect(isValidInput(pub, planBotAnswer('easy', pub, key, 0, rng).input), q.id).toBe(true);
    }
  });
});

describe('selectQuestions', () => {
  it('spreads picks across categories without duplicates', () => {
    const picked = selectQuestions(bank, CATEGORIES, 18, seededRng('sel'));
    expect(picked).toHaveLength(18);
    expect(new Set(picked.map((q) => q.id)).size).toBe(18);
    for (const c of CATEGORIES) expect(picked.filter((q) => q.category === c)).toHaveLength(3);
  });

  it('respects the category filter', () => {
    const picked = selectQuestions(bank, ['spot'], 10, seededRng('spot'));
    expect(picked.every((q) => q.category === 'spot')).toBe(true);
  });
});

// ── Room flow ──
function setup(hostPlays = true) {
  const rng = seededRng('room');
  const created = createRoom({ code: 'ABCDE', hostPlays, hostName: 'Lan', settings: { questionCount: 6, botLevel: 'medium', fillBots: true } }, 0, rng);
  return { ...created, rng };
}

function rightInput(priv: RoomPrivate): AnswerInput {
  const k = priv.key!;
  if (k.kind === 'choice') return { kind: 'choice', option: k.option };
  if (k.kind === 'spot') return { kind: 'spot', seg: k.seg, type: k.type };
  return { kind: 'order', order: k.order.slice() };
}

describe('room flow', () => {
  it('runs a solo game against 5 bots to the end', () => {
    const { room, priv, player, rng } = setup();
    expect(player).not.toBeNull();
    startGame(room, priv, bank, 1000, rng);
    expect(room.order).toHaveLength(MAX_SEATS);
    expect(Object.values(room.players).filter((p) => p.bot)).toHaveLength(5);
    expect(room.status).toBe('question');
    let now = 1000;
    for (let i = 0; i < room.qTotal; i++) {
      const cur = room.current!;
      now = cur.openedAt + 2000;
      const closed = submitAnswer(room, priv, bank, player!.playerId, room.qIndex, rightInput(priv), now);
      expect(closed).toBe(true);
      expect(room.status).toBe('reveal');
      expect(room.reveal!.results[player!.playerId]!.fraction).toBe(1);
      expect(room.reveal!.explanation.length).toBeGreaterThan(0);
      // Only the host can move on while auto-next is off.
      expect(advance(room, priv, bank, now + 60000, { isHost: false })).toBe(false);
      expect(advance(room, priv, bank, now + 100, { isHost: true })).toBe(true);
    }
    expect(room.status).toBe('finished');
    const me = room.players[player!.playerId]!;
    expect(me.correct).toBe(room.qTotal);
    expect(me.bestStreak).toBe(room.qTotal);
    expect(ranking(room)[0]!.id).toBe(player!.playerId);
  });

  it('does not give bots a name that looks like a human player', () => {
    const { room, priv, rng } = setup(); // host is "Lan"
    startGame(room, priv, bank, 1000, rng);
    const names = Object.values(room.players).filter((p) => p.bot).map((p) => p.name);
    expect(names).toHaveLength(5);
    expect(names.some((n) => n.startsWith('Lan'))).toBe(false);
  });

  it('closes at the deadline and scores missing answers as 0', () => {
    const { room, priv, player, rng } = setup();
    startGame(room, priv, bank, 1000, rng);
    const cur = room.current!;
    expect(advance(room, priv, bank, cur.deadline - 1, { isHost: false })).toBe(false);
    expect(advance(room, priv, bank, cur.deadline, { isHost: false })).toBe(true);
    expect(room.reveal!.results[player!.playerId]).toMatchObject({ answered: false, points: 0 });
    // A second caller with the old view does nothing.
    expect(advance(room, priv, bank, cur.deadline + 10, { isHost: false, expectStatus: 'question' })).toBe(false);
  });

  it('auto-advances after the reveal delay when enabled', () => {
    const rng = seededRng('auto');
    const { room, priv } = createRoom({ code: 'AUTO1', hostPlays: false, settings: { questionCount: 5, autoNextSec: 8 } }, 0, rng);
    joinRoom(room, priv, 'Hà', 10, rng);
    startGame(room, priv, bank, 1000, rng);
    advance(room, priv, bank, room.current!.deadline, { isHost: false });
    const revealedAt = room.reveal!.revealedAt;
    expect(advance(room, priv, bank, revealedAt + 7999, { isHost: false })).toBe(false);
    expect(advance(room, priv, bank, revealedAt + 8000, { isHost: false })).toBe(true);
    expect(room.qIndex).toBe(1);
  });

  it('waits for every human before closing early', () => {
    const rng = seededRng('two');
    const { room, priv, player } = createRoom({ code: 'TWO22', hostPlays: true, hostName: 'An', settings: { questionCount: 5, fillBots: false } }, 0, rng);
    const b = joinRoom(room, priv, 'Bình', 5, rng);
    startGame(room, priv, bank, 1000, rng);
    expect(room.order).toHaveLength(2);
    const t = room.current!.openedAt + 1000;
    expect(submitAnswer(room, priv, bank, player!.playerId, 0, rightInput(priv), t)).toBe(false);
    expect(() => submitAnswer(room, priv, bank, player!.playerId, 0, rightInput(priv), t)).toThrow(/đã trả lời/);
    expect(submitAnswer(room, priv, bank, b.playerId, 0, rightInput(priv), t + 500)).toBe(true);
    const r = room.reveal!.results;
    expect(r[player!.playerId]!.points).toBeGreaterThan(r[b.playerId]!.points);
  });

  it('limits seats, dedupes names and rejects late or malformed answers', () => {
    const { room, priv, rng } = setup(false);
    for (let i = 0; i < MAX_SEATS; i++) joinRoom(room, priv, 'Minh', i, rng);
    expect(new Set(Object.values(room.players).map((p) => p.name)).size).toBe(MAX_SEATS);
    expect(() => joinRoom(room, priv, 'Thêm', 99, rng)).toThrow(/đủ 6/);
    startGame(room, priv, bank, 1000, rng);
    const pid = room.order[0]!;
    expect(() => submitAnswer(room, priv, bank, pid, 0, { kind: 'choice', option: 99 }, room.current!.openedAt)).toThrow();
    expect(() => submitAnswer(room, priv, bank, pid, 0, rightInput(priv), room.current!.deadline + 5000)).toThrow(/Hết giờ/);
    expect(() => submitAnswer(room, priv, bank, pid, 3, rightInput(priv), room.current!.openedAt)).toThrow();
  });

  it('hints halve the points and are limited per game', () => {
    const { room, priv, player, rng } = setup();
    startGame(room, priv, bank, 1000, rng);
    const pid = player!.playerId;
    const playOne = (hint: boolean) => {
      if (hint) useHint(room, priv, pid, room.qIndex, room.current!.openedAt);
      submitAnswer(room, priv, bank, pid, room.qIndex, rightInput(priv), room.current!.openedAt);
      const pts = room.reveal!.results[pid]!.points;
      advance(room, priv, bank, room.reveal!.revealedAt, { isHost: true });
      return pts;
    };
    const p1 = playOne(true);
    expect(p1).toBe(500);
    playOne(true);
    expect(room.players[pid]!.hintsLeft).toBe(0);
    expect(() => useHint(room, priv, pid, room.qIndex, room.current!.openedAt)).toThrow(/hết lượt/);
  });

  it('can be finished early by the host', () => {
    const { room, priv, rng } = setup();
    startGame(room, priv, bank, 1000, rng);
    finishGame(room, priv, bank, 5000);
    expect(room.status).toBe('finished');
    expect(priv.key).toBeNull();
  });

  it('never leaks the answer key into the public room document', () => {
    const { room, priv, rng } = setup();
    startGame(room, priv, bank, 1000, rng);
    const pubText = JSON.stringify(room satisfies RoomDoc);
    expect(pubText).not.toContain('"key"');
    expect(pubText).not.toContain(priv.hostToken);
  });
});

describe('Firestore compatibility', () => {
  // Firestore rejects arrays nested directly in arrays ("invalid nested entity").
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

  it('every question, reveal and private state can be stored in Firestore', () => {
    for (const q of bank) {
      const { pub, key } = preparePublic(q, seededRng(q.id));
      expect(nestedArrayPath(pub), q.id).toBeNull();
      expect(nestedArrayPath(key), q.id).toBeNull();
    }
    const rng = seededRng('fs');
    const { room, priv, player } = createRoom({ code: 'FSFSF', hostPlays: true, hostName: 'A', settings: { questionCount: 30 } }, 0, rng);
    startGame(room, priv, bank, 1000, rng);
    while (room.status !== 'finished') {
      expect(nestedArrayPath(room)).toBeNull();
      expect(nestedArrayPath(priv)).toBeNull();
      submitAnswer(room, priv, bank, player!.playerId, room.qIndex, rightInput(priv), room.current!.openedAt);
      expect(nestedArrayPath(room)).toBeNull();
      advance(room, priv, bank, room.reveal!.revealedAt, { isHost: true });
    }
  });
});
