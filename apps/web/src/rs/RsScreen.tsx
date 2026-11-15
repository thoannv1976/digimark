// Màn hình chiếu cho các game nhiều vòng (Screen.tsx thêm các nút của giảng viên qua RsControls).
import type { RsRoomDoc } from '@arena/rs';
import { MAX_SEATS } from '@arena/types';
import { Qr, joinUrl } from '../components/common';
import { api } from '../lib/api';
import { Countdown, HistoryChart, RsStandings } from './parts';
import { rsWebOf } from './registry';

export function RsScreen({ room, now }: { room: RsRoomDoc; now: number }) {
  const web = rsWebOf(room.game);
  if (!web) return null;
  if (room.status === 'lobby') {
    return (
      <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <Qr text={joinUrl(room.code)} size={280} />
          <p className="text-lg text-ink/70">{joinUrl(room.code).replace(/^https?:\/\//, '')}</p>
        </div>
        <div className="space-y-4">
          <p className="text-2xl font-semibold text-ink/70">{web.tag}</p>
          <p className="text-7xl font-extrabold tracking-[0.3em]">{room.code}</p>
          <p className="text-xl">
            Đơn vị ({room.order.length}/{MAX_SEATS}){room.settings.fillBots && room.order.length < MAX_SEATS ? ' · ghế trống do máy chơi' : ''}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {room.order.map((id) => (
              <div key={id} className="pop rounded-xl bg-white px-4 py-3 text-2xl font-semibold ring-1 ring-ink/10">
                {room.players[id]!.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (room.status === 'decide') {
    const info = web.roundInfo(room.round);
    const humans = room.order.filter((id) => !room.players[id]?.bot);
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-3xl font-extrabold">
            {web.roundWord} {room.round}/{room.rounds} · {info.title}
          </span>
          <Countdown deadline={room.deadline} now={now} big />
        </div>
        <div className="card text-2xl leading-relaxed">{info.text}</div>
        <div className="card text-xl">
          <p className="font-bold">
            ✋ {humans.filter((id) => room.submitted[id]).length}/{humans.length} kế hoạch đã nộp
          </p>
          <p className="mt-1 text-lg text-ink/70">{humans.map((id) => `${room.submitted[id] ? '✅' : '⏳'} ${room.players[id]?.name}`).join(' · ')}</p>
        </div>
        {room.round > 1 && (
          <div className="grid gap-5 lg:grid-cols-2">
            {web.Market && (
              <div className="card">
                <web.Market room={room} big />
              </div>
            )}
            <div className="card">
              <RsStandings room={room} web={web} big />
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="card">
        <p className="text-xl text-ink/60">
          {web.roundWord} {room.round}/{room.rounds} · {web.roundInfo(room.round).title}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-2xl">
          {room.news.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {web.Market && (
          <div className="card">
            <web.Market room={room} big />
          </div>
        )}
        <div className="card">
          <HistoryChart room={room} web={web} height={240} />
        </div>
      </div>
      <div className="card">
        <h2 className="mb-2 text-2xl font-bold">{room.status === 'finished' ? '🏆 Xếp hạng chung cuộc' : 'Bảng xếp hạng'}</h2>
        <RsStandings room={room} web={web} big />
      </div>
      {room.status === 'finished' && (
        <div className="card text-xl leading-relaxed">
          <h2 className="mb-2 font-bold">Tổng kết</h2>
          <ol className="list-decimal space-y-1 pl-6">
            {web.debrief.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function RsControls({ room, hostToken, busy, run }: { room: RsRoomDoc; hostToken: string; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const web = rsWebOf(room.game);
  const word = web?.roundWord ?? 'Vòng';
  return (
    <div className="flex flex-wrap justify-center gap-3 pt-2">
      {room.status === 'lobby' && (
        <button type="button" className="btn-primary px-8 py-3 text-xl" disabled={busy || !room.order.length} onClick={() => run(() => api.start(room.code, hostToken))}>
          ▶ Bắt đầu
        </button>
      )}
      {room.status === 'decide' && (
        <>
          {room.deadline !== null && (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(() => api.extend(room.code, hostToken))}>
              +1 phút
            </button>
          )}
          <button
            type="button"
            className="btn-dark"
            disabled={busy}
            onClick={() => window.confirm(`Chốt ${word.toLowerCase()} ngay? Ai chưa nộp sẽ dùng lại kế hoạch ${word.toLowerCase()} trước.`) && run(() => api.advance(room.code, { hostToken, expectStatus: 'decide', expectQuarter: room.round }))}
          >
            Chốt {word.toLowerCase()} ngay
          </button>
        </>
      )}
      {room.status === 'results' && (
        <button type="button" className="btn-primary px-8 py-3 text-xl" disabled={busy} onClick={() => run(() => api.advance(room.code, { hostToken, expectStatus: 'results', expectQuarter: room.round }))}>
          Sang {word.toLowerCase()} {room.round + 1} →
        </button>
      )}
    </div>
  );
}
