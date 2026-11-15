// Những mảnh dùng chung cho các game nhiều vòng (Game 4, Game 5).
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { RS_GAME_IDS, type RsGameId, type RsMe, type RsRoomDoc, type RsScorecard } from '@arena/rs';
import { api } from '../lib/api';

export const asRs = (room: unknown) => room as RsRoomDoc;
export const isRsRoom = (room: unknown) => (RS_GAME_IDS as string[]).includes((room as { game?: string } | null | undefined)?.game ?? '');

const grp = (v: number, d = 0) => {
  const s = Math.abs(v).toFixed(d);
  const [i, f] = s.split('.');
  const int = i!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 && Number(s) !== 0 ? '−' : '') + int + (f ? ',' + f : '');
};
export const fmtNum = (v: number, d = 0) => grp(v, d);
/** Tỷ đồng. */
export const bnv = (v: number, d = 2) => `${grp(v, d)} tỷ`;
export const pctv = (v: number, d = 0) => `${grp(v * 100, d)}%`;

export const COLORS = ['#f2a900', '#0e9f6e', '#2a5680', '#d64545', '#8b5cf6', '#0ea5e9'];
export const colorOf = (room: RsRoomDoc, id: string) => COLORS[Math.max(0, room.order.indexOf(id)) % COLORS.length]!;
export const rankedIds = (room: RsRoomDoc) => room.order.slice().sort((a, b) => (room.standings[a]?.rank ?? 99) - (room.standings[b]?.rank ?? 99));

export interface ColSpec {
  key: string;
  label: string;
  fmt: (v: number) => string;
  bad?: (v: number) => boolean;
}

/** Mỗi game nhiều vòng cung cấp phần này cho các màn hình dùng chung. */
export interface RsWeb<D = any, R = any, V = any> {
  id: RsGameId;
  tag: string;
  roundWord: string;
  rounds: number;
  Briefing: ComponentType<{ compact?: boolean }>;
  roundInfo: (round: number) => { title: string; text: string };
  initial: (me: RsMe<R, V> | null, round: number) => D;
  /** Trả về lời nhắc nếu kế hoạch chưa nộp được. */
  check: (d: D, me: RsMe<R, V> | null, round: number, room: RsRoomDoc) => string | null;
  Form: ComponentType<{ room: RsRoomDoc; me: RsMe<R, V> | null; d: D; set: (d: D) => void; round: number }>;
  Report: ComponentType<{ report: R; room: RsRoomDoc }>;
  /** Bảng công khai thêm cho màn hình chiếu và trang kết quả. */
  Market?: ComponentType<{ room: RsRoomDoc; me?: string; big?: boolean }>;
  /** Màn hình cuối: lật mô hình ẩn từ me.view. */
  Reveal?: ComponentType<{ me: RsMe<R, V>; room: RsRoomDoc }>;
  cols: ColSpec[];
  chart: { title: string; fmt: (v: number) => string; zero?: boolean };
  scoreParts: Record<string, string>;
  scoreMax: Record<string, number>;
  badges: Record<string, string>;
  archetypes: Record<string, string>;
  debrief: string[];
  /** Cách tính điểm, in ở trang chủ. */
  scoring: string[];
  source: string;
}

export function useRsMe<R, V>(room: RsRoomDoc, playerId?: string, playerToken?: string) {
  const [me, setMe] = useState<RsMe<R, V> | null>(null);
  const key = `${room.status}:${room.round}:${room.history.length}`;
  useEffect(() => {
    if (!playerId || !playerToken || room.status === 'lobby') return;
    let alive = true;
    api
      .rsMe(room.code, playerId, playerToken)
      .then((m) => alive && setMe(m as RsMe<R, V>))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key, room.code, playerId, playerToken, room.status]);
  return me;
}

/** Mọi màn hình đang mở đều nhắc máy chủ khi hết giờ hoặc khi hết thời gian xem kết quả. */
export function useRsAutoAdvance(room: RsRoomDoc | null, now: number, hostToken?: string) {
  const sent = useRef('');
  useEffect(() => {
    if (!room) return;
    let due: number | null = null;
    if (room.status === 'decide' && room.deadline !== null) due = room.deadline + 300;
    if (room.status === 'results' && room.revealedAt && room.settings.resultsSec > 0) due = room.revealedAt + room.settings.resultsSec * 1000 + 300;
    if (due === null || now < due) return;
    const tag = `${room.status}:${room.round}:${Math.floor((now - due) / 4000)}`;
    if (sent.current === tag) return;
    sent.current = tag;
    const { code, status, round } = room;
    setTimeout(() => void api.advance(code, { ...(hostToken ? { hostToken } : {}), expectStatus: status, expectQuarter: round }).catch(() => undefined), Math.random() * 400);
  }, [room, now, hostToken]);
}

export function RsStandings({ room, web, me, big }: { room: RsRoomDoc; web: RsWeb; me?: string; big?: boolean }) {
  const ids = rankedIds(room);
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${big ? 'text-xl' : 'text-sm'}`}>
        <thead className="text-left text-ink/60">
          <tr>
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Đơn vị</th>
            <th className="py-1 pr-2 text-right">Điểm</th>
            {web.cols.map((c) => (
              <th key={c.key} className="py-1 pr-2 text-right">
                {c.label}
              </th>
            ))}
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
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: colorOf(room, id) }} />
                  {p.bot ? '🤖 ' : ''}
                  {p.name}
                  {p.bot && p.archetype && web.archetypes[p.archetype] && <span className="ml-1 text-xs text-ink/50">· {web.archetypes[p.archetype]}</span>}
                  {p.lms && <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800">Moodle</span>}
                  {s?.flag === 'concealed' && <span className="ml-1 rounded bg-bad/15 px-1 text-[10px] text-bad">che giấu sự cố</span>}
                  {s?.defaulted && <span className="ml-1 rounded bg-ink/10 px-1 text-[10px]">không nộp</span>}
                </td>
                <td className="py-1.5 pr-2 text-right font-bold tabular-nums">{s ? fmtNum(s.score, 1) : '–'}</td>
                {web.cols.map((c) => {
                  const v = s?.cols[c.key];
                  return (
                    <td key={c.key} className={`py-1.5 pr-2 text-right tabular-nums ${v !== undefined && c.bad?.(v) ? 'text-bad' : ''}`}>
                      {v === undefined ? '–' : c.fmt(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Một đường cho mỗi đơn vị qua các vòng (room.history). */
export function HistoryChart({ room, web, me, height = 180 }: { room: RsRoomDoc; web: RsWeb; me?: string; height?: number }) {
  const rows = room.history;
  if (!rows.length) return <p className="text-sm text-ink/50">Biểu đồ xuất hiện sau {web.roundWord.toLowerCase()} 1.</p>;
  const w = 560;
  const h = height;
  const pad = 40;
  const vals = rows.flatMap((r) => Object.values(r.values));
  const zero = web.chart.zero !== false;
  const max = zero ? Math.max(1, ...vals) : Math.max(...vals) * 1.02;
  const min = zero ? Math.min(0, ...vals) : Math.min(...vals) * 0.98;
  const xs = (i: number) => pad + (rows.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (rows.length - 1));
  const ys = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - 2 * pad);
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-ink/70">{web.chart.title}</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={web.chart.title}>
        {(zero ? [min, 0, max] : [min, max])
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((v) => (
            <g key={v}>
              <line x1={pad} x2={w - pad} y1={ys(v)} y2={ys(v)} stroke={v === 0 ? '#0b223960' : '#0b223920'} />
              <text x={2} y={ys(v) + 4} fontSize="10" fill="#0b223980">
                {web.chart.fmt(v)}
              </text>
            </g>
          ))}
        {rows.map((r, i) => (
          <text key={r.round} x={xs(i)} y={h - 8} fontSize="11" textAnchor="middle" fill="#0b2239a0">
            Q{r.round}
          </text>
        ))}
        {room.order.map((id, k) => {
          const pts = rows.map((r, i) => `${xs(i)},${ys(r.values[id] ?? 0)}`).join(' ');
          const mine = id === me;
          return <polyline key={id} points={pts} fill="none" stroke={COLORS[k % COLORS.length]} strokeWidth={mine ? 4 : 2} opacity={me && !mine ? 0.5 : 1} />;
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

export function ScoreBars({ sc, web }: { sc: RsScorecard; web: RsWeb }) {
  return (
    <div className="grid gap-2">
      {Object.entries(web.scoreParts).map(([k, label]) => {
        const v = sc.parts[k] ?? 0;
        const max = web.scoreMax[k] ?? 25;
        return (
          <div key={k} className="grid grid-cols-[1fr_5rem_3.5rem] items-center gap-2 text-sm">
            <span className="font-medium">{label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
              <div className={`h-full rounded-full ${v >= max * 0.8 ? 'bg-ok' : v >= max * 0.45 ? 'bg-amber' : 'bg-bad'}`} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
            </div>
            <span className="text-right tabular-nums text-ink/70">
              {v.toFixed(0)}/{max}
            </span>
          </div>
        );
      })}
      <p className="text-right text-sm font-bold">Thẻ mục tiêu: {sc.total.toFixed(0)}/100</p>
    </div>
  );
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

/** Những mảnh nhỏ để dựng phiếu quyết định. */
export function Choice<K extends string | number>({
  options,
  value,
  onChange,
  label,
  note,
  cols = 3,
  disabled,
}: {
  options: readonly K[];
  value: K;
  onChange: (k: K) => void;
  label: (k: K) => string;
  note?: (k: K) => string;
  cols?: number;
  disabled?: (k: K) => boolean;
}) {
  return (
    <div className={`grid gap-1.5 ${cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {options.map((k) => {
        const off = disabled?.(k) ?? false;
        return (
          <button
            key={String(k)}
            type="button"
            disabled={off}
            onClick={() => onChange(k)}
            className={`rounded-xl px-2 py-2 text-left text-xs ring-1 ${value === k ? 'bg-ink text-white ring-ink' : off ? 'bg-ink/5 text-ink/40 ring-ink/10' : 'bg-white ring-ink/15 hover:bg-amber/10'}`}
          >
            <span className="block font-semibold">{label(k)}</span>
            {note && <span className={`block ${value === k ? 'text-white/70' : 'text-ink/50'}`}>{note(k)}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({ label, value, onChange, min = 0, max, step = 1, show }: { label: string; value: number; onChange: (v: number) => void; min?: number; max: number; step?: number; show: (v: number) => string }) {
  const fix = (v: number) => Math.round(v * 1000) / 1000;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="Giảm" className="h-8 w-8 rounded-lg bg-ink/10 font-bold disabled:opacity-30" disabled={value - step < min - 1e-9} onClick={() => onChange(fix(value - step))}>
          −
        </button>
        <span className="min-w-20 text-center font-extrabold tabular-nums">{show(value)}</span>
        <button type="button" aria-label="Tăng" className="h-8 w-8 rounded-lg bg-ink font-bold text-white disabled:opacity-30" disabled={value + step > max + 1e-9} onClick={() => onChange(fix(value + step))}>
          +
        </button>
      </div>
    </div>
  );
}

export function Kv({ rows }: { rows: Array<[string, string, boolean?]> }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
      {rows.map(([k, v, bad]) => (
        <div key={k} className="contents">
          <dt className="text-ink/70">{k}</dt>
          <dd className={`text-right font-semibold tabular-nums ${bad ? 'text-bad' : ''}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Thanh ngang nhỏ để so sánh trong bảng công khai. */
export function Bar({ value, max, tone = 'ok' }: { value: number; max: number; tone?: 'ok' | 'amber' | 'bad' }) {
  const w = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
      <div className={`h-full rounded-full ${tone === 'ok' ? 'bg-ok' : tone === 'amber' ? 'bg-amber' : 'bg-bad'}`} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Ô ngân sách: hiện đã dùng bao nhiêu trên tổng, đỏ khi vượt. */
export function Budget({ spent, total, unit }: { spent: number; total: number; unit: string }) {
  const over = spent > total;
  return (
    <div className={`sticky top-0 z-10 -mx-4 mb-2 flex items-center justify-between gap-3 border-b px-4 py-2 ${over ? 'border-bad/30 bg-bad/10' : 'border-ink/10 bg-paper/95'}`}>
      <span className="text-sm font-semibold">{unit}</span>
      <span className={`text-lg font-extrabold tabular-nums ${over ? 'text-bad' : ''}`}>
        {spent}/{total}
      </span>
    </div>
  );
}
