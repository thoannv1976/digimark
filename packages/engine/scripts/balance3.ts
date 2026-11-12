// npx tsx packages/engine/scripts/balance3.ts [games] [botLevel]
import { playAbm, type AbmStrategy } from '../src/abm/balance.js';
import { FACTORY_IDS } from '../src/abm/types.js';
import type { BotLevel } from '../src/types.js';

const N = Number(process.argv[2] ?? 1000);
const level = (process.argv[3] ?? 'medium') as BotLevel;

function run(label: string, lineup: Record<string, AbmStrategy>) {
  const ids = Object.keys(lineup);
  const acc: Record<string, { win: number; rank: number; grade: number; sc: number; net: number; contracts: number; zero: number }> = {};
  for (const id of ids) acc[id] = { win: 0, rank: 0, grade: 0, sc: 0, net: 0, contracts: 0, zero: 0 };
  const factoryWins: Record<string, Record<string, number>> = {};
  for (let g = 0; g < N; g++) {
    const rot = g % ids.length;
    const seated: Record<string, AbmStrategy> = {};
    for (let i = 0; i < ids.length; i++) seated[ids[(i + rot) % ids.length]!] = lineup[ids[(i + rot) % ids.length]!]!;
    const r = playAbm(seated, 7000 + g);
    for (const id of ids) {
      const a = acc[id]!;
      if (r.rank[id] === 1) a.win++;
      a.rank += r.rank[id]! / N;
      a.grade += r.grade[id]! / N;
      a.sc += r.scorecard[id]! / N;
      a.net += r.net[id]! / N;
      a.contracts += r.contracts[id]! / N;
      if (!r.contracts[id]) a.zero++;
    }
    for (const f of FACTORY_IDS) {
      const w = r.wonBy[f] ?? 'none';
      (factoryWins[f] ??= {})[w] = (factoryWins[f]![w] ?? 0) + 1;
    }
  }
  console.log(`\n== ${label} (${N} games)`);
  console.log('who'.padEnd(12), 'win%'.padStart(6), 'rank'.padStart(6), 'grade'.padStart(7), 'card'.padStart(6), 'net'.padStart(7), 'contr'.padStart(6), 'zero%'.padStart(6));
  for (const id of ids) {
    const a = acc[id]!;
    console.log(id.padEnd(12), ((a.win / N) * 100).toFixed(1).padStart(6), a.rank.toFixed(2).padStart(6), a.grade.toFixed(1).padStart(7), a.sc.toFixed(1).padStart(6), a.net.toFixed(2).padStart(7), a.contracts.toFixed(2).padStart(6), ((a.zero / N) * 100).toFixed(0).padStart(6));
  }
  console.log('factory wins:', FACTORY_IDS.map((f) => `${f} ${Object.entries(factoryWins[f]!).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${Math.round((v / N) * 100)}`).join(' ')}`).join(' | '));
}

const bot = (archetype: AbmStrategy['archetype'], lv: BotLevel = level): AbmStrategy => ({ archetype, level: lv });
run(`5 archetypes (${level}) + ABM hard as the good student`, { fair: bot('fair'), spread: bot('spread'), price: bot('price'), tech: bot('tech'), abm: bot('abm'), student: bot('abm', 'hard') });
run(`5 archetypes (${level}) + a 2nd spread`, { fair: bot('fair'), spread: bot('spread'), price: bot('price'), tech: bot('tech'), abm: bot('abm'), spread2: bot('spread') });
run('3 good students + 3 medium bots', { s1: bot('abm', 'hard'), s2: bot('abm', 'hard'), s3: bot('abm', 'hard'), price: bot('price'), tech: bot('tech'), fair: bot('fair') });
run('student all-in on NM28 (+NM05) vs medium bots', { fair: bot('fair'), spread: bot('spread'), price: bot('price'), tech: bot('tech'), abm: bot('abm'), all28: { archetype: 'abm', level: 'hard', targets: ['NM28', 'NM05'] } });
run('student only NM28 vs medium bots', { fair: bot('fair'), spread: bot('spread'), price: bot('price'), tech: bot('tech'), abm: bot('abm'), only28: { archetype: 'abm', level: 'hard', targets: ['NM28'] } });
run('student spread over 6 (hard) vs medium bots', { fair: bot('fair'), spread: bot('spread'), price: bot('price'), tech: bot('tech'), abm: bot('abm'), wide: { archetype: 'abm', level: 'hard', targets: ['NM05', 'NM19', 'NM22', 'NM17', 'NM25', 'NM20'] } });
