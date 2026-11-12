import { useState } from 'react';
import { MAX_SEATS } from '@arena/types';
import { FACTORIES, FACTORY_IDS, MONTHS, type AbmRoomDoc } from '@arena/abm';
import { Qr, joinUrl } from '../components/common';
import { AbmStandings, AwardCard, Countdown, DEBRIEF, FactoryFacts, Heatmap, HiddenTable, rankedIds, ty } from './parts';

/** Projector view for Game 3 (Screen.tsx adds the host buttons). `shown` = awards revealed so far. */
export function AbmScreen({ room, now, shown }: { room: AbmRoomDoc; now: number; shown: number }) {
  if (room.status === 'lobby') {
    return (
      <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <Qr text={joinUrl(room.code)} size={280} />
          <p className="text-lg text-ink/70">{joinUrl(room.code).replace(/^https?:\/\//, '')}</p>
        </div>
        <div className="space-y-4">
          <p className="text-2xl font-semibold text-ink/70">Săn hợp đồng trọng điểm · 8 nhà máy · 3 tháng + nộp hồ sơ</p>
          <p className="text-7xl font-extrabold tracking-[0.3em]">{room.code}</p>
          <p className="text-xl">Nhà cung cấp đã vào ({room.order.length}/{MAX_SEATS}){room.settings.fillBots && room.order.length < MAX_SEATS ? ' · chỗ trống do máy điều hành' : ''}</p>
          <div className="grid grid-cols-2 gap-2">
            {room.order.map((id) => (
              <div key={id} className="pop rounded-xl bg-white px-4 py-3 text-2xl font-semibold ring-1 ring-ink/10">{room.players[id]!.name}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (room.status === 'decide') {
    const done = room.order.filter((id) => room.players[id]?.bot || room.submitted[id]).length;
    const bid = room.round > MONTHS;
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-3xl font-extrabold">{bid ? 'Vòng nộp hồ sơ' : `Tháng ${room.round}/${MONTHS} · tiếp cận`}</span>
          <Countdown deadline={room.deadline} now={now} big />
        </div>
        {room.event && (
          <div className="card space-y-2">
            <p className="text-lg font-semibold uppercase tracking-widest text-ink/50">{bid ? 'Hướng dẫn' : 'Sự kiện của tháng'}</p>
            <p className="text-4xl font-extrabold">{room.event.title}</p>
            <p className="text-2xl leading-relaxed text-ink/80">{room.event.text}</p>
          </div>
        )}
        <p className="text-center text-3xl font-bold">✋ {done}/{room.order.length} {bid ? 'đã nộp hồ sơ' : 'đã nộp kế hoạch'}</p>
        {room.round === 1 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {FACTORY_IDS.map((f) => (
              <div key={f} className="card space-y-1">
                <p className="text-2xl font-extrabold">{f} <span className="text-lg font-normal text-ink/60">{FACTORIES[f].sector}</span></p>
                <FactoryFacts f={f} />
                <p className="text-lg text-ink/70">📰 {FACTORIES[f].news}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="card">
            <p className="mb-2 text-2xl font-extrabold">Tháng trước ai theo nhà máy nào</p>
            <Heatmap room={room} big />
          </div>
        )}
      </div>
    );
  }

  if (room.status === 'results') {
    return (
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="card space-y-3">
          <p className="text-2xl font-extrabold">Hết tháng {room.round}: ai đang theo nhà máy nào</p>
          <Heatmap room={room} big />
        </div>
        <div className="space-y-4">
          {room.news.length > 0 && (
            <div className="card space-y-2 text-xl">
              {room.news.map((n) => (
                <p key={n}>📰 {n}</p>
              ))}
            </div>
          )}
          <div className="card">
            <p className="mb-2 text-2xl font-extrabold">Chi phí tiếp cận đến nay</p>
            <AbmStandings room={room} big />
          </div>
        </div>
      </div>
    );
  }

  // finished: awards one by one, then the podium
  const awards = room.awards ?? [];
  const all = shown >= awards.length;
  const ids = rankedIds(room);
  const podium = [ids[1], ids[0], ids[2]];
  const heights = ['h-32', 'h-44', 'h-24'];
  return (
    <div className="space-y-6">
      <h2 className="text-center text-4xl font-extrabold">🤝 Trao hợp đồng thử 12 tháng</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {awards.slice(0, shown).map((a) => (
          <AwardCard key={a.factory} room={room} a={a} big />
        ))}
      </div>
      {!all && <p className="text-center text-xl text-ink/60">Còn {awards.length - shown} nhà máy chưa công bố…</p>}
      {all && (
        <>
          <div className="flex items-end justify-center gap-4">
            {podium.map((id, i) =>
              id ? (
                <div key={id} className="pop flex w-60 flex-col items-center gap-1">
                  <span className="text-center text-2xl font-bold">{room.players[id]!.bot ? '🤖 ' : ''}{room.players[id]!.name}</span>
                  <span className="text-lg tabular-nums">{room.standings[id]?.contracts ?? 0} hợp đồng · {ty(room.standings[id]?.net ?? 0)}</span>
                  <div className={`flex w-full items-start justify-center rounded-t-2xl pt-3 text-5xl ${heights[i]} ${i === 1 ? 'bg-amber' : 'bg-ink text-white'}`}>{i === 1 ? '1' : i === 0 ? '2' : '3'}</div>
                </div>
              ) : (
                <div key={i} className="w-60" />
              ),
            )}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="card">
              <AbmStandings room={room} big />
            </div>
            <div className="card space-y-3 text-xl leading-relaxed">
              <p className="text-2xl font-extrabold">Câu hỏi tổng kết</p>
              <ol className="list-decimal space-y-2 pl-6">
                {DEBRIEF.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </div>
          </div>
          {room.hidden && (
            <div className="card">
              <p className="mb-2 text-2xl font-extrabold">🔓 Phần ẩn của 8 nhóm mua</p>
              <HiddenTable room={room} big />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Award reveal pacing on the projector: host clicks "next", others see everything at once. */
export function useAwardStepper(room: AbmRoomDoc | null, host: boolean) {
  const [shown, setShown] = useState(0);
  const total = room?.awards?.length ?? 0;
  return { shown: host ? shown : total, next: () => setShown((s) => Math.min(total, s + 1)), all: () => setShown(total), total };
}
