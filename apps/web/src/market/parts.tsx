import { useEffect, useRef, useState } from 'react';
import {
  ARCHETYPE_INFO,
  SEGMENTS,
  SEGMENT_INFO,
  TARGETS,
  type MarketMe,
  type MarketRoomDoc,
  type QuarterKpis,
  type Scorecard,
} from '@arena/market';
import { api, serverNow } from '../lib/api';

export const ty = (v: number, d = 1) => `${v.toFixed(d).replace('.', ',')} tỷ`;
export const pct = (v: number, d = 0) => `${(v * 100).toFixed(d).replace('.', ',')}%`;
export const num = (v: number) => Math.round(v).toLocaleString('vi-VN');
export const star = (v: number) => `${v.toFixed(2).replace('.', ',')}★`;

export const asMarket = (room: unknown) => room as MarketRoomDoc;

export function rankedIds(room: MarketRoomDoc): string[] {
  return room.order.slice().sort((a, b) => (room.standings[a]?.rank ?? 99) - (room.standings[b]?.rank ?? 99));
}

/** Player's private dashboard, refreshed whenever the room moves on. */
export function useMarketMe(room: MarketRoomDoc, playerId?: string, playerToken?: string) {
  const [me, setMe] = useState<MarketMe | null>(null);
  const key = `${room.status}:${room.quarter}:${room.history.length}`;
  useEffect(() => {
    if (!playerId || !playerToken || room.status === 'lobby') return;
    let alive = true;
    api
      .me(room.code, playerId, playerToken)
      .then((m) => alive && setMe(m))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key, room.code, playerId, playerToken, room.status]);
  return me;
}

/** Nudges the server when the decision timer ends or the auto-next delay is over (idempotent). */
export function useMarketAutoAdvance(room: MarketRoomDoc | null, now: number, hostToken?: string) {
  const sent = useRef('');
  useEffect(() => {
    if (!room) return;
    let due: number | null = null;
    if (room.status === 'decide' && room.deadline !== null) due = room.deadline + 300;
    if (room.status === 'results' && room.revealedAt && room.settings.resultsSec > 0) due = room.revealedAt + room.settings.resultsSec * 1000 + 300;
    if (due === null || now < due) return;
    const tag = `${room.status}:${room.quarter}:${Math.floor((now - due) / 4000)}`;
    if (sent.current === tag) return;
    sent.current = tag;
    const { code, status, quarter } = room;
    setTimeout(() => {
      void api.advance(code, { ...(hostToken ? { hostToken } : {}), expectStatus: status, expectQuarter: quarter }).catch(() => undefined);
    }, Math.random() * 400);
  }, [room, now, hostToken]);
}

export function Countdown({ deadline, now, big }: { deadline: number | null; now: number; big?: boolean }) {
  if (deadline === null) return <span className={`font-semibold text-ink/60 ${big ? 'text-2xl' : 'text-sm'}`}>Không giới hạn thời gian</span>;
  const left = Math.max(0, deadline - now);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className={`font-extrabold tabular-nums ${big ? 'text-5xl' : 'text-2xl'} ${left < 30000 ? 'text-bad' : ''}`}>
      {m}:{String(s).padStart(2, '0')}
    </span>
  );
}

export function Standings({ room, me, big }: { room: MarketRoomDoc; me?: string; big?: boolean }) {
  const ids = rankedIds(room);
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${big ? 'text-xl' : 'text-sm'}`}>
        <thead className="text-left text-ink/60">
          <tr>
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Chuỗi</th>
            <th className="py-1 pr-2 text-right">Giá trị DN</th>
            <th className="py-1 pr-2 text-right">Thị phần GT</th>
            <th className="py-1 pr-2 text-right">Điểm sao</th>
            <th className="py-1 text-right">Lợi nhuận lũy kế</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const p = room.players[id]!;
            const s = room.standings[id];
            return (
              <tr key={id} className={`border-t border-ink/10 ${id === me ? 'bg-amber/20 font-semibold' : ''}`}>
                <td className="py-1.5 pr-2 font-extrabold">{s?.rank ?? '–'}</td>
                <td className="py-1.5 pr-2">
                  {p.bot ? '🤖 ' : ''}
                  {p.name}
                  {p.bot && p.archetype && <span className="ml-1 text-xs text-ink/50">· {ARCHETYPE_INFO[p.archetype]}</span>}
                  {p.lms && <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800">Moodle</span>}
                  {s?.defaulted && <span className="ml-1 rounded bg-ink/10 px-1 text-[10px]">mặc định</span>}
                </td>
                <td className="py-1.5 pr-2 text-right font-bold tabular-nums">{s ? s.valueIndex.toFixed(1).replace('.', ',') : '–'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{s ? pct(s.share, 1) : '–'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{s ? star(s.rating) : '–'}</td>
                <td className="py-1.5 text-right tabular-nums">{s ? ty(s.profitCum) : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const COLORS = ['#f2a900', '#0e9f6e', '#2a5680', '#d64545', '#8b5cf6', '#0ea5e9'];

/** Value share per chain over the quarters (SVG lines). */
export function ShareChart({ room, me, height = 180 }: { room: MarketRoomDoc; me?: string; height?: number }) {
  const rows = room.history;
  if (!rows.length) return <p className="text-sm text-ink/50">Biểu đồ thị phần xuất hiện sau quý 1.</p>;
  const w = 560;
  const h = height;
  const pad = 28;
  const maxShare = Math.max(0.2, ...rows.flatMap((r) => Object.values(r.shares))) * 1.1;
  const xs = (i: number) => pad + (rows.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (rows.length - 1));
  const ys = (v: number) => h - pad - (v / maxShare) * (h - 2 * pad);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Thị phần theo giá trị qua các quý">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad} x2={w - pad} y1={ys(maxShare * t)} y2={ys(maxShare * t)} stroke="#0b223920" />
            <text x={4} y={ys(maxShare * t) + 4} fontSize="10" fill="#0b223980">{pct(maxShare * t)}</text>
          </g>
        ))}
        {rows.map((r, i) => (
          <text key={r.quarter} x={xs(i)} y={h - 8} fontSize="11" textAnchor="middle" fill="#0b2239a0">Q{r.quarter}</text>
        ))}
        {room.order.map((id, k) => {
          const pts = rows.map((r, i) => `${xs(i)},${ys(r.shares[id] ?? 0)}`).join(' ');
          const mine = id === me;
          return (
            <g key={id}>
              <polyline points={pts} fill="none" stroke={COLORS[k % COLORS.length]} strokeWidth={mine ? 4 : 2} opacity={me && !mine ? 0.55 : 1} />
              {rows.map((r, i) => (
                <circle key={i} cx={xs(i)} cy={ys(r.shares[id] ?? 0)} r={mine ? 4 : 2.5} fill={COLORS[k % COLORS.length]} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {room.order.map((id, k) => (
          <span key={id} className={`flex items-center gap-1 ${id === me ? 'font-bold' : ''}`}>
            <span className="inline-block h-2 w-3 rounded" style={{ background: COLORS[k % COLORS.length] }} />
            {room.players[id]?.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ScorecardBars({ sc, kpis }: { sc: Scorecard; kpis?: QuarterKpis }) {
  const rows: Array<[string, number, string]> = [
    ['Doanh thu ngoài nhiên liệu ≥ 3%', sc.nonfuel, kpis ? pct(kpis.nonfuelPct, 1) : ''],
    [`Mua lại gas ≥ ${pct(TARGETS.repurchase)}`, sc.repurchase, kpis ? pct(kpis.repurchase) : ''],
    [`Điểm sao ≥ ${String(TARGETS.rating).replace('.', ',')}`, sc.rating, kpis ? star(kpis.rating) : ''],
    ['Phản hồi sự cố đúng cách', sc.crisis, ''],
  ];
  return (
    <div className="grid gap-2">
      {rows.map(([label, v, now]) => (
        <div key={label} className="grid grid-cols-[1fr_6rem_3.5rem] items-center gap-2 text-sm">
          <span className="font-medium">
            {label}
            {now && <span className="ml-1 text-ink/50">(hiện {now})</span>}
          </span>
          <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
            <div className={`h-full rounded-full ${v >= 24.9 ? 'bg-ok' : v >= 12.5 ? 'bg-amber' : 'bg-bad'}`} style={{ width: `${(v / 25) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums text-ink/70">{v.toFixed(0)}/25</span>
        </div>
      ))}
      <p className="text-right text-sm font-bold">Thẻ điểm mục tiêu: {sc.total.toFixed(0)}/100</p>
    </div>
  );
}

export function KpiTable({ now, prev }: { now: QuarterKpis; prev?: QuarterKpis }) {
  const rows: Array<[string, string, string | null]> = [
    ['Khách hàng', num(now.customers), prev ? num(prev.customers) : null],
    ['Khách mới', num(now.newCustomers), prev ? num(prev.newCustomers) : null],
    ['Doanh thu', ty(now.revenue), prev ? ty(prev.revenue) : null],
    ['Lãi gộp', ty(now.grossProfit, 2), prev ? ty(prev.grossProfit, 2) : null],
    ['Chi marketing', ty(now.spend), prev ? ty(prev.spend) : null],
    ['Lợi nhuận quý', ty(now.profit, 2), prev ? ty(prev.profit, 2) : null],
    ['ROI so với xuất phát', now.roi === null ? '–' : pct(now.roi), prev ? (prev.roi === null ? '–' : pct(prev.roi)) : null],
    ['CAC (nghìn đ/khách mới)', now.cac === null ? '–' : num(now.cac), prev ? (prev.cac === null ? '–' : num(prev.cac)) : null],
    ['Mua lại gas 45 ngày', pct(now.repurchase), prev ? pct(prev.repurchase) : null],
    ['Điểm sao Google Maps', star(now.rating), prev ? star(prev.rating) : null],
    ['Doanh thu ngoài nhiên liệu', pct(now.nonfuelPct, 1), prev ? pct(prev.nonfuelPct, 1) : null],
    ['Nhận biết thương hiệu', `${Math.round(now.awareness)}/100`, prev ? `${Math.round(prev.awareness)}/100` : null],
  ];
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-ink/60">
        <tr>
          <th className="py-1">Chỉ số</th>
          <th className="py-1 text-right">Quý này</th>
          {prev && <th className="py-1 text-right">Quý trước</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, a, b]) => (
          <tr key={label} className="border-t border-ink/10">
            <td className="py-1.5">{label}</td>
            <td className="py-1.5 text-right font-semibold tabular-nums">{a}</td>
            {prev && <td className="py-1.5 text-right tabular-nums text-ink/60">{b}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SegmentTable({ now, prev }: { now: QuarterKpis; prev?: QuarterKpis }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-ink/60">
        <tr>
          <th className="py-1">Phân khúc</th>
          <th className="py-1 text-right">Khách</th>
          <th className="py-1 text-right">Thị phần</th>
          <th className="py-1 text-right">Thay đổi</th>
        </tr>
      </thead>
      <tbody>
        {SEGMENTS.map((s) => {
          const d = prev ? now.segShares[s] - prev.segShares[s] : 0;
          return (
            <tr key={s} className="border-t border-ink/10">
              <td className="py-1.5">{SEGMENT_INFO[s].name}</td>
              <td className="py-1.5 text-right tabular-nums">{num(now.segCustomers[s])}</td>
              <td className="py-1.5 text-right tabular-nums">{pct(now.segShares[s], 1)}</td>
              <td className={`py-1.5 text-right tabular-nums ${d > 0.0005 ? 'text-ok' : d < -0.0005 ? 'text-bad' : 'text-ink/40'}`}>
                {prev ? `${d > 0 ? '+' : ''}${(d * 100).toFixed(1).replace('.', ',')} điểm` : '–'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const nowServer = serverNow;
