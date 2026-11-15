// Chạy một game nhiều vòng toàn bằng máy, không cần phòng thật – dùng để cân bằng.
import { gradeOf } from '../market/score.js';
import { seededRng } from '../rng.js';
import type { BotLevel } from '../types.js';
import type { RsGame, RsInput } from './room.js';
import type { RsRoomDoc, RsScorecard } from './types.js';

export interface RsSeat {
  archetype: string;
  level: BotLevel;
}

export interface RsPlayOut {
  scorecard: Record<string, RsScorecard>;
  rank: Record<string, number>;
  grade: Record<string, number>;
  cols: Record<string, Record<string, number>>;
  state: unknown;
}

export function playRs(def: RsGame, lineup: Record<string, RsSeat>, seed: number): RsPlayOut {
  const order = Object.keys(lineup);
  const room = {
    code: 'BALANCE',
    game: def.id,
    rounds: def.rounds,
    order,
    settings: def.defaultSettings,
  } as unknown as RsRoomDoc;
  const state = def.init(order, room, seededRng(`bal:${def.id}:${seed}`));
  for (let r = 1; r <= def.rounds; r++) {
    const rng = seededRng(`bal:${def.id}:${seed}:${r}`);
    const inputs: Record<string, RsInput<unknown>> = {};
    for (const id of order) {
      const seat = lineup[id]!;
      inputs[id] = { decision: def.bot(seat.archetype, seat.level, state, id, r, rng), defaulted: false };
    }
    def.simulate(state, order, inputs, r, rng);
  }
  const scorecard = Object.fromEntries(order.map((id) => [id, def.scorecard(state, id, true)]));
  const ranked = order.slice().sort((a, b) => scorecard[b]!.total - scorecard[a]!.total);
  const rank = Object.fromEntries(ranked.map((id, i) => [id, i + 1]));
  const grade = Object.fromEntries(order.map((id) => [id, gradeOf(scorecard[id]!.total, rank[id]!, order.length)]));
  const cols = Object.fromEntries(order.map((id) => [id, def.cols(state, id, true)]));
  return { scorecard, rank, grade, cols, state };
}
