// npx tsx packages/engine/scripts/balance.ts [games]
import { playGame, SMART, type Strategy } from '../src/market/balance.js';
import type { BotLevel } from '../src/types.js';

const N = Number(process.argv[2] ?? 2000);
const level = (process.argv[3] ?? 'medium') as BotLevel;
function run(label: string, lineup: Record<string, Strategy>) {
  const wins: Record<string, number> = {}, grade: Record<string, number> = {}, sc: Record<string, number> = {}, profit: Record<string, number> = {}, share: Record<string, number> = {}, rank: Record<string, number> = {};
  for (let g = 0; g < N; g++) {
    // rotate seats so seat order never matters
    const ids = Object.keys(lineup);
    const rot = g % ids.length;
    const seated: Record<string, Strategy> = {};
    for (let i = 0; i < ids.length; i++) seated[ids[(i + rot) % ids.length]!] = lineup[ids[(i + rot) % ids.length]!]!;
    const r = playGame(seated, 1000 + g);
    for (const id of ids) {
      if (r.ranks[id] === 1) wins[id] = (wins[id] ?? 0) + 1;
      grade[id] = (grade[id] ?? 0) + r.grades[id]! / N;
      sc[id] = (sc[id] ?? 0) + r.scorecards[id]! / N;
      profit[id] = (profit[id] ?? 0) + r.profit[id]! / N;
      share[id] = (share[id] ?? 0) + r.share[id]! / N;
      rank[id] = (rank[id] ?? 0) + r.ranks[id]! / N;
    }
  }
  console.log(`\n== ${label} (${N} games)`);
  console.log('who'.padEnd(12), 'win%'.padStart(6), 'rank'.padStart(6), 'grade'.padStart(7), 'scorecard'.padStart(10), 'profit'.padStart(8), 'share%'.padStart(8));
  for (const id of Object.keys(lineup)) console.log(id.padEnd(12), (((wins[id] ?? 0) / N) * 100).toFixed(1).padStart(6), rank[id]!.toFixed(2).padStart(6), grade[id]!.toFixed(1).padStart(7), sc[id]!.toFixed(1).padStart(10), profit[id]!.toFixed(1).padStart(8), share[id]!.toFixed(1).padStart(8));
}
const bot = (archetype: 'price' | 'ads' | 'care' | 'green' | 'balanced', lv: BotLevel = level): Strategy => ({ kind: 'bot', archetype, level: lv });
run(`5 archetypes + smart (bots ${level})`, { price: bot('price'), ads: bot('ads'), care: bot('care'), green: bot('green'), balanced: bot('balanced'), smart: SMART });
run(`5 archetypes + balanced twin (no smart, ${level})`, { price: bot('price'), ads: bot('ads'), care: bot('care'), green: bot('green'), balanced: bot('balanced'), balanced2: bot('balanced') });
