import { MAX_SEATS } from '@arena/types';
import type { MarketRoomDoc } from '@arena/market';
import { Qr, joinUrl } from '../components/common';
import { Countdown, ShareChart, Standings, rankedIds, ty } from './parts';

/** Projector view for Game 1 (no controls here; Screen.tsx adds the host buttons). */
export function MarketScreen({ room, now }: { room: MarketRoomDoc; now: number }) {
  if (room.status === 'lobby') {
    return (
      <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <Qr text={joinUrl(room.code)} size={280} />
          <p className="text-lg text-ink/70">{joinUrl(room.code).replace(/^https?:\/\//, '')}</p>
        </div>
        <div className="space-y-4">
          <p className="text-2xl font-semibold text-ink/70">Đấu trường Thị phần · {room.quarters} quý · ngân sách 2 tỷ/quý</p>
          <p className="text-7xl font-extrabold tracking-[0.3em]">{room.code}</p>
          <p className="text-xl">Chuỗi đã vào ({room.order.length}/{MAX_SEATS}){room.settings.fillBots && room.order.length < MAX_SEATS ? ' · chỗ trống do máy điều hành' : ''}</p>
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
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-3xl font-extrabold">Quý {room.quarter}/{room.quarters} · ra quyết định</span>
          <Countdown deadline={room.deadline} now={now} big />
        </div>
        {room.event && (
          <div className="card space-y-2">
            <p className="text-lg font-semibold uppercase tracking-widest text-ink/50">Sự kiện của quý</p>
            <p className="text-4xl font-extrabold">{room.event.title}</p>
            <p className="text-2xl leading-relaxed text-ink/80">{room.event.text}</p>
            {room.event.special && <p className="text-2xl font-bold text-bad">⚠ Khủng hoảng xảy ra tại chuỗi: {room.players[room.event.special.playerId]?.name}</p>}
          </div>
        )}
        {room.news.length > 0 && (
          <div className="rounded-2xl bg-ink px-6 py-4 text-xl text-white">
            {room.news.map((n) => (
              <p key={n}>📰 {n}</p>
            ))}
          </div>
        )}
        <p className="text-center text-3xl font-bold">✋ {done}/{room.order.length} chuỗi đã quyết định</p>
        {room.history.length > 0 && (
          <div className="card">
            <ShareChart room={room} height={220} />
          </div>
        )}
      </div>
    );
  }

  const ids = rankedIds(room);
  if (room.status === 'results') {
    return (
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="card space-y-3">
          <p className="text-2xl font-extrabold">Đua thị phần (theo giá trị) – sau quý {room.quarter}</p>
          <ShareChart room={room} height={300} />
          {room.news.length > 0 && (
            <div className="space-y-1 text-lg">
              {room.news.map((n) => (
                <p key={n}>📰 {n}</p>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <p className="mb-2 text-2xl font-extrabold">Bảng xếp hạng</p>
          <Standings room={room} big />
        </div>
      </div>
    );
  }

  // finished
  const podium = [ids[1], ids[0], ids[2]];
  const heights = ['h-32', 'h-44', 'h-24'];
  return (
    <div className="space-y-6">
      <h2 className="text-center text-4xl font-extrabold">🏆 Kết quả Đấu trường Thị phần</h2>
      <div className="flex items-end justify-center gap-4">
        {podium.map((id, i) =>
          id ? (
            <div key={id} className="pop flex w-60 flex-col items-center gap-1">
              <span className="text-center text-2xl font-bold">{room.players[id]!.bot ? '🤖 ' : ''}{room.players[id]!.name}</span>
              <span className="text-lg tabular-nums">GTDN {room.standings[id]?.valueIndex.toFixed(1).replace('.', ',')} · {ty(room.standings[id]?.profitCum ?? 0)}</span>
              <div className={`flex w-full items-start justify-center rounded-t-2xl pt-3 text-5xl ${heights[i]} ${i === 1 ? 'bg-amber' : 'bg-ink text-white'}`}>{i === 1 ? '1' : i === 0 ? '2' : '3'}</div>
            </div>
          ) : (
            <div key={i} className="w-60" />
          ),
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <Standings room={room} big />
          <div className="mt-4">
            <ShareChart room={room} height={220} />
          </div>
        </div>
        <div className="card space-y-3 text-xl leading-relaxed">
          <p className="text-2xl font-extrabold">Câu hỏi tổng kết</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>Chuỗi nào giảm giá nhiều nhất? Thị phần và lợi nhuận của họ ra sao?</li>
            <li>Phân khúc nào bị bỏ trống, phân khúc nào bị tranh giành? Ai chọn đúng “chiến trường”?</li>
            <li>Ai giữ định vị nhất quán qua các quý? Điều đó thể hiện ở đâu trên bảng điều khiển?</li>
            <li>Khi có video “bơm thiếu”, chuỗi bị ảnh hưởng phản ứng thế nào và trả giá ra sao?</li>
            <li>Ai đã mua nghiên cứu khách hàng, và dùng nó để quyết định gì?</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
