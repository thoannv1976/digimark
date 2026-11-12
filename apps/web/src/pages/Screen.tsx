import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { MAX_SEATS, type Category, type PlayerPublic, type RoomDoc } from '@arena/types';
import { CategoryStats, ErrorNote, Leaderboard, PlayerName, Qr, TimerBar, downloadText, joinUrl, resultsCsv } from '../components/common';
import { AnswerReview, CategoryChip, QuestionHeader, QuestionPreview } from '../components/QuestionView';
import { api } from '../lib/api';
import { answeredCount, rankPlayers, useAutoAdvance, useNow, useRoom } from '../lib/hooks';
import { getHostedRooms, getSession } from '../lib/storage';
import { MarketScreen } from '../market/MarketScreen';
import { asMarket, useMarketAutoAdvance } from '../market/parts';
import { marketCsv } from '../components/common';

/** Projector screen for one room. Host controls appear when this browser created the room. */
export function Screen() {
  const code = (useParams().code ?? '').toUpperCase();
  const { room, error } = useRoom(code);
  const now = useNow();
  const hostToken = getHostedRooms().find((r) => r.code === code)?.hostToken ?? getSession(code)?.hostToken;
  useAutoAdvance(room, now, hostToken);
  const isMarket = (room as unknown as { game?: string } | null | undefined)?.game === 'market-share';
  useMarketAutoAdvance(room && isMarket ? asMarket(room) : null, now, hostToken);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  if (room === undefined) return <div className="flex min-h-screen items-center justify-center bg-ink text-2xl text-white">Đang mở phòng {code}…</div>;
  if (room === null) return <div className="flex min-h-screen items-center justify-center bg-ink text-2xl text-white">Không tìm thấy phòng {code}</div>;

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between bg-ink px-6 py-3 text-white">
        <span className="text-xl font-extrabold">{isMarket ? '📈 Đấu trường Thị phần' : '🔍 Thám tử AI'} · <span className="text-amber">{room.title}</span></span>
        <span className="text-lg">
          Mã phòng <b className="text-2xl tracking-[0.2em] text-amber">{room.code}</b>
        </span>
      </header>
      <main className="mx-auto max-w-6xl space-y-5 p-6">
        <ErrorNote text={error ?? actionError} />
        {isMarket && <MarketScreen room={asMarket(room)} now={now} />}
        {!isMarket && room.status === 'lobby' && <LobbyScreen room={room} />}
        {!isMarket && room.status === 'question' && <QuestionScreen room={room} now={now} />}
        {!isMarket && room.status === 'reveal' && <RevealScreen room={room} now={now} />}
        {!isMarket && room.status === 'finished' && <FinalScreen room={room} />}

        {hostToken && isMarket && <MarketControls room={asMarket(room)} hostToken={hostToken} busy={busy} run={run} />}
        {hostToken && !isMarket && (
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {room.status === 'lobby' && (
              <button type="button" className="btn-primary px-8 py-3 text-xl" disabled={busy || !room.order.length} onClick={() => run(() => api.start(room.code, hostToken))}>
                ▶ Bắt đầu
              </button>
            )}
            {room.status === 'reveal' && (
              <button type="button" className="btn-primary px-8 py-3 text-xl" disabled={busy} onClick={() => run(() => api.advance(room.code, { hostToken, expectStatus: 'reveal', expectQIndex: room.qIndex }))}>
                {room.qIndex + 1 >= room.qTotal ? 'Kết quả chung cuộc' : 'Câu tiếp →'}
              </button>
            )}
            {room.status === 'finished' && (
              <button type="button" className="btn-dark" onClick={() => downloadText(`ket-qua-${room.code}.csv`, resultsCsv([room]))}>
                ⬇ Xuất kết quả
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function MarketControls({ room, hostToken, busy, run }: { room: import('@arena/market').MarketRoomDoc; hostToken: string; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
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
          <button type="button" className="btn-dark" disabled={busy} onClick={() => window.confirm('Chốt quý ngay? Chuỗi chưa nộp sẽ giữ quyết định quý trước.') && run(() => api.advance(room.code, { hostToken, expectStatus: 'decide', expectQuarter: room.quarter }))}>
            Chốt quý ngay
          </button>
        </>
      )}
      {room.status === 'results' && (
        <button type="button" className="btn-primary px-8 py-3 text-xl" disabled={busy} onClick={() => run(() => api.advance(room.code, { hostToken, expectStatus: 'results', expectQuarter: room.quarter }))}>
          Sang quý {room.quarter + 1} →
        </button>
      )}
      {room.status === 'finished' && (
        <button type="button" className="btn-dark" onClick={() => downloadText(`ket-qua-thi-phan-${room.code}.csv`, marketCsv([room]))}>
          ⬇ Xuất kết quả
        </button>
      )}
    </div>
  );
}

function LobbyScreen({ room }: { room: RoomDoc }) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-3">
        <Qr text={joinUrl(room.code)} size={280} />
        <p className="text-lg text-ink/70">{joinUrl(room.code).replace(/^https?:\/\//, '')}</p>
      </div>
      <div className="space-y-4">
        <p className="text-2xl font-semibold text-ink/70">Quét mã QR hoặc vào trang chủ và nhập mã</p>
        <p className="text-7xl font-extrabold tracking-[0.3em]">{room.code}</p>
        <p className="text-xl">
          Người chơi ({room.order.length}/{MAX_SEATS}){room.settings.fillBots && room.order.length < MAX_SEATS ? ' · ghế trống do máy chơi' : ''}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {room.order.map((id) => (
            <div key={id} className="pop rounded-xl bg-white px-4 py-3 text-2xl font-semibold ring-1 ring-ink/10">
              <PlayerName p={room.players[id]!} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuestionScreen({ room, now }: { room: RoomDoc; now: number }) {
  const cur = room.current!;
  const count = answeredCount(room, now);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold text-ink/60">Câu {room.qIndex + 1}/{room.qTotal}</span>
        <CategoryChip category={cur.q.category} big />
        <span className="text-2xl font-bold">✋ {count.done}/{count.total}</span>
      </div>
      {now < cur.openedAt ? (
        <div className="rounded-xl bg-ink py-3 text-center text-3xl font-bold text-amber">Chuẩn bị… {Math.ceil((cur.openedAt - now) / 1000)}</div>
      ) : (
        <TimerBar openedAt={cur.openedAt} deadline={cur.deadline} now={now} big />
      )}
      <div className="card space-y-5">
        <QuestionHeader q={cur.q} big />
        <QuestionPreview q={cur.q} />
      </div>
    </div>
  );
}

function RevealScreen({ room, now }: { room: RoomDoc; now: number }) {
  const reveal = room.reveal!;
  const q = room.current!.q;
  const autoLeft = room.settings.autoNextSec > 0 ? Math.max(0, Math.ceil((reveal.revealedAt + room.settings.autoNextSec * 1000 - now) / 1000)) : null;
  return (
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-ink/60">Đáp án câu {room.qIndex + 1}/{room.qTotal}</span>
          <CategoryChip category={q.category} big />
        </div>
        <p className="text-2xl font-bold">{q.prompt}</p>
        <AnswerReview q={q} answerKey={reveal.key} big {...(reveal.distribution ? { distribution: reveal.distribution } : {})} />
        <div className="rounded-xl bg-amber/15 p-4 text-xl leading-relaxed">
          <b>Vì sao:</b> {reveal.explanation}
          {reveal.source && <p className="mt-2 text-base text-ink/50">Nguồn: {reveal.source}</p>}
        </div>
      </div>
      <div className="space-y-3">
        <h2 className="text-2xl font-extrabold">Bảng xếp hạng</h2>
        <Leaderboard room={room} reveal={reveal} big />
        {autoLeft !== null && <p className="text-center text-lg text-ink/60">Tự chuyển sau {autoLeft}s</p>}
      </div>
    </div>
  );
}

function FinalScreen({ room }: { room: RoomDoc }) {
  const list = rankPlayers(room);
  const podium = [list[1], list[0], list[2]];
  const heights = ['h-32', 'h-44', 'h-24'];
  // Aggregate the humans' answers per category for the debrief.
  const humans = list.filter((p) => !p.bot);
  const team = humans.length
    ? {
        ...humans[0]!,
        stats: humans.reduce<PlayerPublic['stats']>((acc, p) => {
          for (const [c, st] of Object.entries(p.stats) as [Category, { n: number; ok: number }][]) {
            const cur = acc[c] ?? { n: 0, ok: 0 };
            acc[c] = { n: cur.n + st.n, ok: cur.ok + st.ok };
          }
          return acc;
        }, {}),
      }
    : null;
  return (
    <div className="space-y-6">
      <h2 className="text-center text-4xl font-extrabold">🏆 Kết quả chung cuộc</h2>
      <div className="flex items-end justify-center gap-4">
        {podium.map((p, i) =>
          p ? (
            <div key={p.id} className="pop flex w-56 flex-col items-center gap-2">
              <span className="text-center text-2xl font-bold"><PlayerName p={p} /></span>
              <span className="text-xl font-extrabold tabular-nums">{p.score}</span>
              <div className={`flex w-full items-start justify-center rounded-t-2xl pt-3 text-5xl ${heights[i]} ${i === 1 ? 'bg-amber' : 'bg-ink text-white'}`}>{i === 1 ? '1' : i === 0 ? '2' : '3'}</div>
            </div>
          ) : (
            <div key={i} className="w-56" />
          ),
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <Leaderboard room={room} big />
        </div>
        {team && (
          <div className="card">
            <h3 className="mb-1 text-xl font-bold">Người chơi trong phòng trả lời đúng theo chủ đề</h3>
            <p className="mb-3 text-sm text-ink/60">Gợi ý tổng kết: chủ đề nhiều đỏ nhất là chỗ cần nhắc lại.</p>
            <CategoryStats p={team} />
          </div>
        )}
      </div>
    </div>
  );
}
