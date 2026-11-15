// Cân bằng Game 4 "Tín hiệu sớm": npx tsx packages/engine/scripts/balance4.ts [games] [botLevel]
import { playRs, type RsSeat } from '../src/rs/balance.js';
import { SIGNAL_ROOM } from '../src/sg/game.js';
import { SG_ARCHETYPE_INFO } from '../src/sg/types.js';
import type { BotLevel } from '../src/types.js';

const N = Number(process.argv[2] ?? 200);
const level = (process.argv[3] ?? 'medium') as BotLevel;

function run(label: string, lineup: Record<string, RsSeat>) {
  const ids = Object.keys(lineup);
  const acc: Record<string, { win: number; rank: number; grade: number; sc: number; profit: number; early: number; disc: number; shifts: number; verified: number }> = {};
  for (const id of ids) acc[id] = { win: 0, rank: 0, grade: 0, sc: 0, profit: 0, early: 0, disc: 0, shifts: 0, verified: 0 };
  for (let g = 0; g < N; g++) {
    const r = playRs(SIGNAL_ROOM, lineup, 4100 + g);
    for (const id of ids) {
      const a = acc[id]!;
      if (r.rank[id] === 1) a.win++;
      a.rank += r.rank[id]! / N;
      a.grade += r.grade[id]! / N;
      a.sc += r.scorecard[id]!.total / N;
      a.profit += (r.scorecard[id]!.parts.profit ?? 0) / N;
      a.early += (r.scorecard[id]!.parts.early ?? 0) / N;
      a.disc += (r.scorecard[id]!.parts.discipline ?? 0) / N;
      a.shifts += (r.cols[id]!.shifts ?? 0) / N;
      a.verified += (r.cols[id]!.verified ?? 0) / N;
    }
  }
  console.log(`\n== ${label} (${N} ván, mức ${level})`);
  console.log('lối chơi'.padEnd(12), 'win%'.padStart(6), 'hạng'.padStart(6), 'điểm'.padStart(6), 'thẻ'.padStart(6), 'lãi'.padStart(6), 'sớm'.padStart(6), 'kỷ l.'.padStart(6), 'bắt'.padStart(5), 'k.chứng'.padStart(8));
  for (const id of ids.slice().sort((a, b) => acc[b]!.sc - acc[a]!.sc)) {
    const a = acc[id]!;
    console.log(
      id.padEnd(12),
      ((a.win / N) * 100).toFixed(1).padStart(6),
      a.rank.toFixed(2).padStart(6),
      a.grade.toFixed(1).padStart(6),
      a.sc.toFixed(1).padStart(6),
      a.profit.toFixed(1).padStart(6),
      a.early.toFixed(1).padStart(6),
      a.disc.toFixed(1).padStart(6),
      a.shifts.toFixed(1).padStart(5),
      a.verified.toFixed(1).padStart(8),
    );
  }
}

const seat = (archetype: string, lv: BotLevel = level): RsSeat => ({ archetype, level: lv });
console.log('Lối chơi:', Object.entries(SG_ARCHETYPE_INFO).map(([k, v]) => `${k}=${v}`).join(', '));
run('5 cái bẫy + học viên đọc tín hiệu có chọn lọc', {
  hoarder: seat('hoarder'),
  believer: seat('believer'),
  pricewatch: seat('pricewatch'),
  aionly: seat('aionly'),
  latecomer: seat('latecomer'),
  reader: seat('reader'),
});
run('hai học viên giỏi cùng phòng', {
  hoarder: seat('hoarder'),
  believer: seat('believer'),
  pricewatch: seat('pricewatch'),
  aionly: seat('aionly'),
  reader1: seat('reader'),
  reader2: seat('reader'),
});
