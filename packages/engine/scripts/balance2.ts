// Focused "good" strategies against each other: is more than one path viable?
import { playGame, type Strategy } from '../src/market/balance.js';
import { emptyBudget } from '../src/market/sim.js';
import { EVENTS } from '../src/market/model.js';
import type { BudgetKey, CardId, SegmentId } from '../src/market/types.js';

const N = Number(process.argv[2] ?? 400);
function plan(name: string, position: CardId, targets: SegmentId[], mix: Partial<Record<BudgetKey, number>>): Strategy {
  return {
    kind: 'script', name,
    decide: (q, crisis) => {
      const budget = emptyBudget();
      const m = { ...mix };
      if (q === 1) m.research = 0.2;
      const event = EVENTS[q - 1];
      const choice = event ? (crisis ? 'own' : ({ e10: 'train', swap: 'partner', crisis: 'review', lez: position === 'green' ? 'ev' : 'cars', churn: 'call' } as Record<string, string>)[event.id]) : undefined;
      const cost = event ? ((crisis ? event.special!.options : event.options).find((o) => o.id === choice)?.cost ?? 0) : 0;
      const avail = 2 - cost;
      const tot = Object.values(m).reduce((a, b) => a + (b ?? 0), 0);
      let used = 0;
      for (const [k, v] of Object.entries(m) as [BudgetKey, number][]) { budget[k] = Math.floor((v / tot) * avail * 10 + 1e-9) / 10; used += budget[k]; }
      return { position, targets, budget, ...(choice ? { eventChoice: choice } : {}) };
    },
  };
}
const cars = plan('cars', 'fivestar', ['cars', 'riders'], { maps: 0.3, training: 0.3, ads: 0.4, app: 0.3, crm: 0.1, green: 0.4 });
const gas = plan('gas', 'safe', ['households', 'restaurants'], { maps: 0.3, training: 0.3, crm: 0.5, app: 0.3, ads: 0.2, green: 0.2 });
const green = plan('green', 'green', ['ev', 'riders'], { maps: 0.3, training: 0.3, green: 0.6, app: 0.3, ads: 0.3, crm: 0.0001 });
const digital = plan('digital', 'loyalty', ['riders', 'households'], { maps: 0.3, training: 0.3, app: 0.5, crm: 0.3, ads: 0.3, green: 0.1 });
const lineups: Record<string, Record<string, Strategy>> = {
  'four focused + 2 bots': { cars, gas, green, digital, b1: { kind: 'bot', archetype: 'balanced', level: 'medium' }, b2: { kind: 'bot', archetype: 'ads', level: 'medium' } },
};
for (const [label, lineup] of Object.entries(lineups)) {
  const wins: Record<string, number> = {}, grade: Record<string, number> = {}, sc: Record<string, number> = {}, profit: Record<string, number> = {};
  const ids = Object.keys(lineup);
  for (let g = 0; g < N; g++) {
    const rot = g % ids.length; const seated: Record<string, Strategy> = {};
    for (let i = 0; i < ids.length; i++) seated[ids[(i + rot) % ids.length]!] = lineup[ids[(i + rot) % ids.length]!]!;
    const r = playGame(seated, 5000 + g);
    for (const id of ids) { if (r.ranks[id] === 1) wins[id] = (wins[id] ?? 0) + 1; grade[id] = (grade[id] ?? 0) + r.grades[id]! / N; sc[id] = (sc[id] ?? 0) + r.scorecards[id]! / N; profit[id] = (profit[id] ?? 0) + r.profit[id]! / N; }
  }
  console.log(`\n== ${label}`);
  for (const id of ids) console.log(id.padEnd(10), 'win', (((wins[id] ?? 0) / N) * 100).toFixed(1).padStart(5), ' grade', grade[id]!.toFixed(1).padStart(5), ' scorecard', sc[id]!.toFixed(1).padStart(5), ' profit', profit[id]!.toFixed(1).padStart(6));
}
