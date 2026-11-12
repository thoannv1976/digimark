import { useEffect, useRef, useState } from 'react';
import {
  ABM_ARCHETYPE_INFO,
  FACTORIES,
  FACTORY_IDS,
  INFLUENCE_LABEL,
  MONTHS,
  PRICE_INFO,
  RELATION_LABEL,
  ROLES,
  ROLE_INFO,
  SOURCE_LABEL,
  THEME_INFO,
  type AbmAward,
  type AbmMe,
  type AbmRoomDoc,
  type AbmScorecard,
  type FactoryId,
} from '@arena/abm';
import { api } from '../lib/api';

export const asAbm = (room: unknown) => room as AbmRoomDoc;
export const isAbmRoom = (room: unknown) => (room as { game?: string } | null | undefined)?.game === 'key-accounts';

export const ty = (v: number, d = 2) => `${v.toFixed(d).replace('.', ',')} tỷ`;
export const tr = (v: number) => (v >= 1000 ? ty(v / 1000) : `${Math.round(v)} triệu`);
export const st = (v: number) => `${v.toFixed(1).replace('.', ',')}★`;
export const tonnes = (v: number) => `${Math.round(v).toLocaleString('vi-VN')} tấn`;
export const isBidRound = (room: AbmRoomDoc) => room.round > MONTHS;
export const roundLabel = (room: AbmRoomDoc) => (room.round > MONTHS ? 'Nộp hồ sơ' : `Tháng ${room.round}/${MONTHS}`);

export const COLORS = ['#f2a900', '#0e9f6e', '#2a5680', '#d64545', '#8b5cf6', '#0ea5e9'];
export const colorOf = (room: AbmRoomDoc, id: string) => COLORS[Math.max(0, room.order.indexOf(id)) % COLORS.length]!;

export function rankedIds(room: AbmRoomDoc): string[] {
  return room.order.slice().sort((a, b) => (room.standings[a]?.rank ?? 99) - (room.standings[b]?.rank ?? 99));
}

/** Player's private view, refreshed whenever the room moves on. */
export function useAbmMe(room: AbmRoomDoc, playerId?: string, playerToken?: string) {
  const [me, setMe] = useState<AbmMe | null>(null);
  const key = `${room.status}:${room.round}:${room.revealedAt ?? 0}`;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!playerId || !playerToken || room.status === 'lobby') return;
    let alive = true;
    api
      .abmMe(room.code, playerId, playerToken)
      .then((m) => alive && setMe(m))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key, tick, room.code, playerId, playerToken, room.status]);
  return { me, reload: () => setTick((t) => t + 1) };
}

/** Nudges the server when the round timer ends or the auto-next delay is over (idempotent). */
export function useAbmAutoAdvance(room: AbmRoomDoc | null, now: number, hostToken?: string) {
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
    setTimeout(() => {
      void api.advance(code, { ...(hostToken ? { hostToken } : {}), expectStatus: status, expectQuarter: round }).catch(() => undefined);
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

/** 0..5 stars as a small bar. */
export function Stars({ v, small }: { v: number; small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 ${small ? 'text-xs' : 'text-sm'}`} title={st(v)}>
      <span className="relative inline-block leading-none tracking-[-0.05em] text-ink/15">
        ★★★★★
        <span className="absolute inset-0 overflow-hidden text-amber" style={{ width: `${(Math.min(5, v) / 5) * 100}%` }}>★★★★★</span>
      </span>
      <span className="tabular-nums text-ink/60">{v.toFixed(1).replace('.', ',')}</span>
    </span>
  );
}

export function FactoryFacts({ f, compact }: { f: FactoryId; compact?: boolean }) {
  const x = FACTORIES[f];
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      <span className="rounded bg-ink/5 px-1.5 py-0.5">{tonnes(x.demand)}/năm</span>
      <span className={`rounded px-1.5 py-0.5 ${x.source === 'domestic' ? 'bg-bad/10 text-bad' : 'bg-ink/5'}`}>{SOURCE_LABEL[x.source]}</span>
      {x.eu && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">Xuất EU</span>}
      <span className="rounded bg-ink/5 px-1.5 py-0.5">{RELATION_LABEL[x.relation]}</span>
      {!compact && <span className="rounded bg-ink/5 px-1.5 py-0.5">{x.province}</span>}
    </div>
  );
}

/** Who worked 1:1 on which factory last month (projector and phones). */
export function Heatmap({ room, me, big }: { room: AbmRoomDoc; me?: string; big?: boolean }) {
  const any = FACTORY_IDS.some((f) => room.heat[f]?.length);
  if (!any) return <p className="text-sm text-ink/50">Bản đồ “ai đang theo nhà máy nào” xuất hiện sau tháng 1.</p>;
  return (
    <div className="space-y-1.5">
      {FACTORY_IDS.map((f) => {
        const ids = room.heat[f] ?? [];
        return (
          <div key={f} className={`grid items-center gap-2 ${big ? 'grid-cols-[9rem_1fr] text-xl' : 'grid-cols-[4.5rem_1fr] text-sm'}`}>
            <span className="font-bold">
              {f}
              {big && <span className="ml-1 text-sm font-normal text-ink/50">{(FACTORIES[f].demand / 1000).toFixed(1).replace('.', ',')}k t</span>}
            </span>
            <div className={`flex flex-wrap items-center gap-1 rounded-lg px-2 py-1 ${ids.length >= 3 ? 'bg-bad/10' : ids.length ? 'bg-amber/15' : 'bg-ink/5'}`}>
              {ids.length === 0 && <span className="text-ink/40">—</span>}
              {ids.map((id) => (
                <span key={id} className={`rounded-full px-2 py-0.5 font-semibold text-white ${big ? 'text-base' : 'text-[11px]'} ${id === me ? 'ring-2 ring-ink' : ''}`} style={{ background: colorOf(room, id) }}>
                  {room.players[id]?.name.replace(' (máy)', '')}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AbmStandings({ room, me, big }: { room: AbmRoomDoc; me?: string; big?: boolean }) {
  const ids = rankedIds(room);
  const done = room.status === 'finished';
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${big ? 'text-xl' : 'text-sm'}`}>
        <thead className="text-left text-ink/60">
          <tr>
            {done && <th className="py-1 pr-2">#</th>}
            <th className="py-1 pr-2">Nhà cung cấp</th>
            {done && <th className="py-1 pr-2 text-right">Hợp đồng</th>}
            {done && <th className="py-1 pr-2 text-right">Lãi gộp</th>}
            <th className="py-1 pr-2 text-right">Chi tiếp cận</th>
            {done && <th className="py-1 text-right">Lãi ròng</th>}
          </tr>
        </thead>
        <tbody>
          {(done ? ids : room.order).map((id) => {
            const p = room.players[id]!;
            const s = room.standings[id];
            return (
              <tr key={id} className={`border-t border-ink/10 ${id === me ? 'bg-amber/20 font-semibold' : ''}`}>
                {done && <td className="py-1.5 pr-2 font-extrabold">{s?.rank ?? '–'}</td>}
                <td className="py-1.5 pr-2">
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: colorOf(room, id) }} />
                  {p.bot ? '🤖 ' : ''}
                  {p.name}
                  {p.bot && p.archetype && <span className="ml-1 text-xs text-ink/50">· {ABM_ARCHETYPE_INFO[p.archetype]}</span>}
                  {p.lms && <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800">Moodle</span>}
                  {s?.defaulted && <span className="ml-1 rounded bg-ink/10 px-1 text-[10px]">không nộp</span>}
                </td>
                {done && <td className="py-1.5 pr-2 text-right tabular-nums">{s?.contracts ?? 0}/{s?.bids ?? 0}</td>}
                {done && <td className="py-1.5 pr-2 text-right tabular-nums">{s ? ty(s.gp) : '–'}</td>}
                <td className="py-1.5 pr-2 text-right tabular-nums">{s ? ty(s.cost) : '–'}</td>
                {done && <td className="py-1.5 text-right font-bold tabular-nums">{s ? ty(s.net) : '–'}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AwardCard({ room, a, me, big }: { room: AbmRoomDoc; a: AbmAward; me?: string; big?: boolean }) {
  const winner = a.winner ? room.players[a.winner] : null;
  const mine = me ? a.bids.find((b) => b.playerId === me) : undefined;
  return (
    <div className={`pop rounded-2xl p-4 ring-1 ${winner ? (a.winner === me ? 'bg-ok/10 ring-ok' : 'bg-white ring-ink/10') : 'bg-ink/5 ring-ink/10'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`font-extrabold ${big ? 'text-2xl' : 'text-lg'}`}>{a.factory} <span className={`font-normal text-ink/60 ${big ? 'text-lg' : 'text-sm'}`}>{FACTORIES[a.factory].sector}</span></p>
          <FactoryFacts f={a.factory} compact={!big} />
        </div>
        <div className="text-right">
          {winner ? (
            <>
              <p className={`font-extrabold ${big ? 'text-2xl' : ''}`} style={{ color: colorOf(room, a.winner!) }}>🏆 {winner.name}</p>
              <p className={`${big ? 'text-lg' : 'text-xs'} text-ink/70`}>{tonnes(a.tonnes)} · {PRICE_INFO[a.price!].short} · lãi gộp {ty(a.gp)}</p>
            </>
          ) : (
            <p className={`font-bold text-ink/60 ${big ? 'text-xl' : 'text-sm'}`}>Giữ nhà cung cấp cũ</p>
          )}
        </div>
      </div>
      <p className={`mt-2 ${big ? 'text-lg' : 'text-sm'} leading-relaxed`}>{a.reason}</p>
      {a.bids.length > 0 && (
        <div className={`mt-2 flex flex-wrap gap-1.5 ${big ? 'text-base' : 'text-xs'}`}>
          {a.bids.map((b) => (
            <span key={b.playerId} className={`rounded-full px-2 py-0.5 ring-1 ${b.playerId === a.winner ? 'bg-ok/15 ring-ok' : 'ring-ink/15'} ${b.playerId === me ? 'font-bold' : ''}`}>
              {b.rank}. {room.players[b.playerId]?.name.replace(' (máy)', '')} · {b.score} điểm · {PRICE_INFO[b.price].short}
            </span>
          ))}
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-ink/60">ngưỡng {a.threshold}</span>
        </div>
      )}
      {mine && a.winner !== me && <p className="mt-2 text-sm text-orange-800">Hồ sơ của bạn: {mine.note}</p>}
    </div>
  );
}

export function ScorecardBars({ sc }: { sc: AbmScorecard }) {
  const rows: Array<[string, number]> = [
    [`Tiếp cận ≥ 3 vai (từ 2★) ở ≥ 3 nhà máy (đang có ${sc.reachedFactories})`, sc.reach],
    ['Thắng ít nhất 2 hợp đồng thử', sc.contracts],
    ['Thắng mà không phá giá (không hồ sơ nào dưới giá nhập khẩu)', sc.noDiscount],
    ['Tỷ lệ thắng ≥ 50% số hồ sơ đã nộp', sc.winRate],
  ];
  return (
    <div className="grid gap-2">
      {rows.map(([label, v]) => (
        <div key={label} className="grid grid-cols-[1fr_5rem_3rem] items-center gap-2 text-sm">
          <span className="font-medium">{label}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
            <div className={`h-full rounded-full ${v >= 24.9 ? 'bg-ok' : v >= 12.5 ? 'bg-amber' : 'bg-bad'}`} style={{ width: `${(v / 25) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums text-ink/70">{v.toFixed(0)}/25</span>
        </div>
      ))}
      <p className="text-right text-sm font-bold">Thẻ mục tiêu ban lãnh đạo: {sc.total.toFixed(0)}/100</p>
    </div>
  );
}

/** The hidden committees, once the facilitator has revealed them. */
export function HiddenTable({ room, big }: { room: AbmRoomDoc; big?: boolean }) {
  if (!room.hidden) return null;
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${big ? 'text-base' : 'text-xs'}`}>
        <thead className="text-left text-ink/60">
          <tr>
            <th className="py-1 pr-2">Nhà máy</th>
            {ROLES.map((r) => (
              <th key={r} className="py-1 pr-2">{ROLE_INFO[r].short}</th>
            ))}
            <th className="py-1 text-right">Ngưỡng</th>
          </tr>
        </thead>
        <tbody>
          {FACTORY_IDS.map((f) => {
            const h = room.hidden![f];
            if (!h) return null;
            return (
              <tr key={f} className="border-t border-ink/10 align-top">
                <td className="py-1.5 pr-2 font-bold">{f}</td>
                {ROLES.map((r) => (
                  <td key={r} className="py-1.5 pr-2">
                    <span className={`rounded px-1 font-semibold ${h.influence[r] === 3 ? 'bg-ink text-white' : h.influence[r] === 2 ? 'bg-ink/15' : 'bg-ink/5 text-ink/60'}`}>{INFLUENCE_LABEL[h.influence[r]]}</span>
                    <br />
                    {h.top[r].map((t, i) => (
                      <span key={t} className={i === 0 ? 'font-medium' : 'text-ink/50'}>
                        {THEME_INFO[t].icon} {THEME_INFO[t].pain}
                        <br />
                      </span>
                    ))}
                  </td>
                ))}
                <td className="py-1.5 text-right tabular-nums">{h.threshold}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const DEBRIEF = [
  'Nhà máy nào bị nhiều nhà cung cấp cùng theo nhất? Ai thắng ở đó, và nhờ vai nào?',
  'Ai chỉ làm việc với phòng mua hàng? Hồ sơ của họ thua ở đâu?',
  'Ai đã theo NM28? Có đáng không, so với quy mô 21.100 tấn?',
  'Khi được nhắn “giảm 3% thì ký ngay”, ai giảm giá, ai gửi bảng tổng chi phí? Kết quả khác nhau thế nào?',
  'Hồ sơ AI có một gợi ý sai: ai phát hiện ra, bằng cách nào?',
];
