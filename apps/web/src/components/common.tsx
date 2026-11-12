import QRCode from 'qrcode';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BOT_LEVEL_LABEL, CATEGORY_LABEL, type Category, type PlayerPublic, type RevealPublic, type RoomDoc } from '@arena/types';
import { ARCHETYPE_INFO, type MarketRoomDoc } from '@arena/market';
import { rankPlayers } from '../lib/hooks';

export function Shell({ children, wide, right }: { children: ReactNode; wide?: boolean; right?: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="bg-ink text-white">
        <div className={`mx-auto flex items-center justify-between gap-3 px-4 py-3 ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>
          <Link to="/" className="flex items-center gap-2 font-extrabold tracking-tight">
            <span className="text-amber">🔍</span> DIGIMARK <span className="font-semibold text-amber">Arena</span>
          </Link>
          {right}
        </div>
      </header>
      <main className={`mx-auto px-4 py-4 sm:py-6 ${wide ? 'max-w-6xl' : 'max-w-xl'}`}>{children}</main>
    </div>
  );
}

/** Shown when the page was opened from Moodle. */
export function MoodleBanner({ lti, role, game }: { lti: { contextTitle: string | null; graded: boolean } | null; role: 'learner' | 'instructor'; game?: string }) {
  if (!lti) return null;
  return (
    <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-900 ring-1 ring-emerald-200">
      <b>Đã kết nối Moodle</b>
      {lti.contextTitle ? ` · ${lti.contextTitle}` : ''}.{' '}
      {role === 'learner'
        ? lti.graded
          ? game === 'market-share'
            ? 'Hết 5 quý, điểm (70% thẻ mục tiêu + 30% thứ hạng) được gửi về Sổ điểm (lấy lần cao nhất).'
            : 'Kết thúc mỗi trận, tỷ lệ câu đúng được gửi về Sổ điểm (lấy lần cao nhất).'
          : 'Hoạt động này không lấy điểm.'
        : 'Học viên mở hoạt động trong Moodle rồi nhập mã phòng; khi phòng kết thúc, điểm tự về Sổ điểm.'}
    </div>
  );
}

export function TimerBar({ openedAt, deadline, now, big }: { openedAt: number; deadline: number; now: number; big?: boolean }) {
  const total = deadline - openedAt;
  const left = Math.max(0, deadline - Math.max(now, openedAt));
  const share = total > 0 ? left / total : 0;
  const secs = Math.ceil(left / 1000);
  const color = share > 0.5 ? 'bg-ok' : share > 0.2 ? 'bg-amber' : 'bg-bad';
  return (
    <div className="flex items-center gap-3">
      <div className={`flex-1 overflow-hidden rounded-full bg-ink/10 ${big ? 'h-4' : 'h-2.5'}`}>
        <div className={`h-full rounded-full ${color} transition-[width] duration-200 ease-linear`} style={{ width: `${share * 100}%` }} />
      </div>
      <span className={`w-12 text-right font-extrabold tabular-nums ${big ? 'text-4xl' : 'text-xl'} ${share <= 0.2 ? 'text-bad' : ''}`}>{secs}</span>
    </div>
  );
}

export function PlayerName({ p }: { p: PlayerPublic }) {
  return (
    <span className="truncate">
      {p.bot ? '🤖 ' : ''}
      {p.name}
      {p.lms && <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800 align-middle">Moodle</span>}
      {p.bot && p.level && <span className="ml-1 text-xs font-normal text-ink/50">({BOT_LEVEL_LABEL[p.level]})</span>}
    </span>
  );
}

export function Leaderboard({ room, me, reveal, big, limit }: { room: RoomDoc; me?: string; reveal?: RevealPublic | null; big?: boolean; limit?: number }) {
  const list = rankPlayers(room).slice(0, limit ?? 6);
  return (
    <ol className="grid gap-1.5">
      {list.map((p, i) => {
        const delta = reveal?.results[p.id]?.points;
        return (
          <li key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${big ? 'text-2xl' : 'text-[15px]'} ${p.id === me ? 'bg-amber/25 ring-2 ring-amber' : 'bg-white ring-1 ring-ink/10'}`}>
            <span className={`w-7 shrink-0 text-center font-extrabold ${i === 0 ? 'text-amber' : 'text-ink/50'}`}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
            <span className="min-w-0 flex-1 font-semibold">
              <PlayerName p={p} />
            </span>
            {delta !== undefined && <span className={`text-sm font-bold tabular-nums ${delta > 0 ? 'text-ok' : delta < 0 ? 'text-bad' : 'text-ink/40'}`}>{delta > 0 ? `+${delta}` : delta}</span>}
            <span className="w-16 text-right font-extrabold tabular-nums">{p.score}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Qr({ text, size = 220 }: { text: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: '#0b2239', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [text, size]);
  return src ? <img src={src} width={size} height={size} alt={`Mã QR vào phòng: ${text}`} className="rounded-xl bg-white p-2" /> : null;
}

export function CategoryStats({ p }: { p: PlayerPublic }) {
  const rows = (Object.entries(p.stats) as [Category, { n: number; ok: number }][]).filter(([, s]) => s.n > 0);
  if (!rows.length) return null;
  return (
    <div className="grid gap-2">
      {rows.map(([c, s]) => (
        <div key={c} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 text-sm">
          <span className="font-medium">{CATEGORY_LABEL[c]}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
            <div className={`h-full rounded-full ${s.ok / s.n >= 0.7 ? 'bg-ok' : s.ok / s.n >= 0.4 ? 'bg-amber' : 'bg-bad'}`} style={{ width: `${(s.ok / s.n) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums text-ink/70">
            {s.ok}/{s.n}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-medium text-bad">{text}</p>;
}

export const joinUrl = (code: string) => `${window.location.origin}/p/${code}`;

export function statusLabel(room: RoomDoc): string {
  if (room.status === 'lobby') return 'Đang chờ';
  if ((room as unknown as MarketRoomDoc).game === 'market-share') {
    const m = room as unknown as MarketRoomDoc;
    if (m.status === 'finished') return 'Đã kết thúc';
    return `Quý ${m.quarter}/${m.quarters}${m.status === 'results' ? ' · kết quả' : ' · quyết định'}`;
  }
  if (room.status === 'finished') return 'Đã kết thúc';
  return `Câu ${room.qIndex + 1}/${room.qTotal}${room.status === 'reveal' ? ' · đáp án' : ''}`;
}

/** CSV (UTF-8 with BOM so Excel shows Vietnamese correctly). */
export function resultsCsv(rooms: RoomDoc[]): string {
  const cats = Object.keys(CATEGORY_LABEL) as Category[];
  const header = ['Phòng', 'Mã phòng', 'Hạng', 'Tên', 'Loại', 'Gửi Moodle', 'Điểm', 'Câu đúng', 'Tổng câu', 'Chuỗi đúng dài nhất', ...cats.map((c) => CATEGORY_LABEL[c])];
  const lines = [header];
  for (const room of rooms) {
    rankPlayers(room).forEach((p, i) => {
      lines.push([
        room.title,
        room.code,
        String(i + 1),
        p.name,
        p.bot ? 'Máy' : 'Người',
        p.lms ? (room.lmsStatus?.[p.id] === 'sent' ? 'Đã gửi' : room.lmsStatus?.[p.id] === 'error' ? 'Lỗi' : 'Chờ') : '',
        String(p.score),
        String(p.correct),
        String(room.status === 'finished' ? room.qTotal : Math.max(0, room.qIndex + (room.status === 'reveal' ? 1 : 0))),
        String(p.bestStreak),
        ...cats.map((c) => (p.stats[c] ? `${p.stats[c]!.ok}/${p.stats[c]!.n}` : '')),
      ]);
    });
  }
  const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + lines.map((l) => l.map(esc).join(',')).join('\r\n');
}

/** Game 1 results (one row per chain). */
export function marketCsv(rooms: MarketRoomDoc[]): string {
  const header = ['Phòng', 'Mã phòng', 'Hạng', 'Chuỗi', 'Loại', 'Gửi Moodle', 'Giá trị doanh nghiệp', 'Thị phần theo giá trị (%)', 'Điểm sao', 'Lợi nhuận lũy kế (tỷ)', 'Thẻ mục tiêu (/100)', 'Số quý'];
  const lines = [header];
  for (const room of rooms) {
    const ids = room.order.slice().sort((a, b) => (room.standings[a]?.rank ?? 99) - (room.standings[b]?.rank ?? 99));
    for (const id of ids) {
      const p = room.players[id]!;
      const s = room.standings[id];
      lines.push([
        room.title,
        room.code,
        String(s?.rank ?? ''),
        p.name,
        p.bot ? `Máy (${p.archetype ? ARCHETYPE_INFO[p.archetype] : ''})` : 'Người',
        p.lms ? (room.lmsStatus?.[id] === 'sent' ? 'Đã gửi' : room.lmsStatus?.[id] === 'error' ? 'Lỗi' : 'Chờ') : '',
        s ? String(s.valueIndex) : '',
        s ? (s.share * 100).toFixed(1) : '',
        s ? s.rating.toFixed(2) : '',
        s ? s.profitCum.toFixed(2) : '',
        s ? String(s.scorecard) : '',
        String(room.history.length),
      ]);
    }
  }
  const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '\ufeff' + lines.map((l) => l.map(esc).join(',')).join('\r\n');
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
