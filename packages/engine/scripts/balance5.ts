// Cân bằng Game 5 "Hành trình và niềm tin": npx tsx packages/engine/scripts/balance5.ts [games] [botLevel]
import { JOURNEY_TRUST } from '../src/jt/game.js';
import { JT_ARCHETYPE_INFO } from '../src/jt/types.js';
import { playRs, type RsSeat } from '../src/rs/balance.js';
import type { BotLevel } from '../src/types.js';

const N = Number(process.argv[2] ?? 200);
const level = (process.argv[3] ?? 'medium') as BotLevel;

function run(label: string, lineup: Record<string, RsSeat>) {
  const ids = Object.keys(lineup);
  type Acc = { win: number; rank: number; grade: number; sc: number; biz: number; cx: number; brand: number; rev: number; inc: number; lv: number };
  const acc: Record<string, Acc> = {};
  for (const id of ids) acc[id] = { win: 0, rank: 0, grade: 0, sc: 0, biz: 0, cx: 0, brand: 0, rev: 0, inc: 0, lv: 0 };
  for (let g = 0; g < N; g++) {
    const r = playRs(JOURNEY_TRUST, lineup, 5100 + g);
    for (const id of ids) {
      const a = acc[id]!;
      if (r.rank[id] === 1) a.win++;
      a.rank += r.rank[id]! / N;
      a.grade += r.grade[id]! / N;
      a.sc += r.scorecard[id]!.total / N;
      a.biz += (r.scorecard[id]!.parts.business ?? 0) / N;
      a.cx += (r.scorecard[id]!.parts.cx ?? 0) / N;
      a.brand += (r.scorecard[id]!.parts.brand ?? 0) / N;
      a.rev += (r.cols[id]!.revenue ?? 0) / N;
      a.inc += (r.cols[id]!.incidents ?? 0) / N;
      a.lv += (r.cols[id]!.stages ?? 0) / N;
    }
  }
  console.log(`\n== ${label} (${N} ván, mức ${level})`);
  console.log('lối chơi'.padEnd(13), 'win%'.padStart(6), 'hạng'.padStart(6), 'điểm'.padStart(6), 'thẻ'.padStart(6), 'k.doanh'.padStart(8), 'tr.ngh'.padStart(7), 'th.hiệu'.padStart(8), 'd.thu'.padStart(6), 'sự cố'.padStart(6), 'cấp'.padStart(5));
  for (const id of ids.slice().sort((a, b) => acc[b]!.sc - acc[a]!.sc)) {
    const a = acc[id]!;
    console.log(
      id.padEnd(13),
      ((a.win / N) * 100).toFixed(1).padStart(6),
      a.rank.toFixed(2).padStart(6),
      a.grade.toFixed(1).padStart(6),
      a.sc.toFixed(1).padStart(6),
      a.biz.toFixed(1).padStart(8),
      a.cx.toFixed(1).padStart(7),
      a.brand.toFixed(1).padStart(8),
      a.rev.toFixed(1).padStart(6),
      a.inc.toFixed(1).padStart(6),
      a.lv.toFixed(1).padStart(5),
    );
  }
}

const seat = (archetype: string, lv: BotLevel = level): RsSeat => ({ archetype, level: lv });
console.log('Lối chơi:', Object.entries(JT_ARCHETYPE_INFO).map(([k, v]) => `${k}=${v}`).join(', '));
run('5 cái bẫy + học viên phủ đủ hành trình', {
  buyreach: seat('buyreach'),
  websiteonly: seat('websiteonly'),
  loose: seat('loose'),
  frontonly: seat('frontonly'),
  hider: seat('hider'),
  balanced: seat('balanced'),
});
run('hai học viên giỏi cùng phòng', {
  buyreach: seat('buyreach'),
  websiteonly: seat('websiteonly'),
  loose: seat('loose'),
  frontonly: seat('frontonly'),
  bal1: seat('balanced'),
  bal2: seat('balanced'),
});
