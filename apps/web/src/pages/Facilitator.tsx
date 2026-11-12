import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BOT_LEVEL_LABEL, CATEGORIES, CATEGORY_LABEL, MAX_SEATS, type BotLevel, type Category, type RoomDoc } from '@arena/types';
import { ErrorNote, MoodleBanner, Shell, downloadText, joinUrl, resultsCsv, statusLabel } from '../components/common';
import { api } from '../lib/api';
import { humansOf, rankPlayers, useAutoAdvance, useNow, useRoom } from '../lib/hooks';
import { getHostedRooms, getLti, setHostedRooms, type HostedRoom } from '../lib/storage';

export function Facilitator() {
  const [rooms, setRooms] = useState<HostedRoom[]>(getHostedRooms);
  const [snapshots, setSnapshots] = useState<Record<string, RoomDoc>>({});
  const [count, setCount] = useState(5);
  const [prefix, setPrefix] = useState('Nhóm');
  const [questions, setQuestions] = useState(15);
  const [level, setLevel] = useState<BotLevel>('medium');
  const [fillBots, setFillBots] = useState(true);
  const [autoNext, setAutoNext] = useState(10);
  const [cats, setCats] = useState<Category[]>(CATEGORIES.slice());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setHostedRooms(rooms), [rooms]);
  const onSnapshot = useCallback((r: RoomDoc) => setSnapshots((s) => (s[r.code]?.version === r.version ? s : { ...s, [r.code]: r })), []);

  async function createRooms() {
    setBusy(true);
    setError(null);
    try {
      const made: HostedRoom[] = [];
      const start = rooms.length + 1;
      for (let i = 0; i < count; i++) {
        const title = `${prefix.trim() || 'Phòng'} ${start + i}`;
        const r = await api.createRoom({ hostPlays: false, title, settings: { questionCount: questions, botLevel: level, fillBots, autoNextSec: autoNext, categories: cats } });
        made.push({ code: r.code, hostToken: r.hostToken, title, createdAt: Date.now() });
      }
      setRooms((old) => [...old, ...made]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được phòng.');
    } finally {
      setBusy(false);
    }
  }

  const live = rooms.map((r) => snapshots[r.code]).filter((r): r is RoomDoc => Boolean(r));
  const waiting = rooms.filter((r) => {
    const s = snapshots[r.code];
    return s?.status === 'lobby' && humansOf(s).length > 0;
  });

  async function startAll() {
    setError(null);
    const results = await Promise.allSettled(waiting.map((r) => api.start(r.code, r.hostToken)));
    const failed = results.filter((x) => x.status === 'rejected').length;
    if (failed) setError(`${failed} phòng chưa bắt đầu được.`);
  }

  return (
    <Shell wide right={<Link to="/" className="text-sm text-white/80 hover:text-white">Trang học viên</Link>}>
      <MoodleBanner lti={getLti()?.role === 'instructor' ? getLti() : null} role="instructor" />
      <h1 className="mb-1 text-2xl font-extrabold">Bảng điều khiển giảng viên · Thám tử AI</h1>
      <p className="mb-4 text-ink/60">Tạo nhiều phòng 6 người, chiếu mã phòng lên màn hình, theo dõi tất cả phòng cùng lúc và xuất kết quả.</p>

      <section className="card mb-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="cnt">Số phòng tạo thêm</label>
            <input id="cnt" type="number" min={1} max={10} className="input" value={count} onChange={(e) => setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
          </div>
          <div>
            <label className="label" htmlFor="pre">Tên phòng</label>
            <input id="pre" className="input" value={prefix} maxLength={30} onChange={(e) => setPrefix(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="qn">Số câu</label>
            <select id="qn" className="input" value={questions} onChange={(e) => setQuestions(Number(e.target.value))}>
              {[10, 12, 15, 20, 25].map((n) => <option key={n} value={n}>{n} câu</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="auto">Chuyển câu</label>
            <select id="auto" className="input" value={autoNext} onChange={(e) => setAutoNext(Number(e.target.value))}>
              <option value={0}>Giảng viên bấm</option>
              {[8, 10, 15, 20].map((n) => <option key={n} value={n}>Tự động sau {n} giây</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <span className="label">Máy chơi thay ghế trống</span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={fillBots} onChange={(e) => setFillBots(e.target.checked)} /> Điền đủ {MAX_SEATS} ghế
              </label>
              {(Object.keys(BOT_LEVEL_LABEL) as BotLevel[]).map((l) => (
                <button key={l} type="button" disabled={!fillBots} onClick={() => setLevel(l)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 disabled:opacity-40 ${level === l ? 'bg-ink text-white ring-ink' : 'ring-ink/15'}`}>
                  {BOT_LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Chủ đề câu hỏi</span>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => {
                const on = cats.includes(c);
                return (
                  <button key={c} type="button" onClick={() => setCats((x) => (on ? (x.length > 1 ? x.filter((y) => y !== c) : x) : [...x, c]))} className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${on ? 'bg-ink text-white ring-ink' : 'ring-ink/15 text-ink/60'}`}>
                    {CATEGORY_LABEL[c]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-end gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={createRooms}>{busy ? 'Đang tạo…' : `+ Tạo ${count} phòng`}</button>
        </div>
      </section>

      <ErrorNote text={error} />

      {rooms.length > 0 && (
        <div className="my-4 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-dark" disabled={!waiting.length} onClick={startAll}>▶ Bắt đầu {waiting.length} phòng đang chờ</button>
          <button type="button" className="btn-ghost" disabled={!live.length} onClick={() => downloadText(`ket-qua-tham-tu-ai-${new Date().toISOString().slice(0, 10)}.csv`, resultsCsv(live))}>⬇ Xuất kết quả (Excel/CSV)</button>
          <button type="button" className="btn-ghost text-bad" onClick={() => window.confirm('Bỏ tất cả phòng khỏi danh sách này? (Phòng vẫn tồn tại 3 ngày.)') && setRooms([])}>Xóa danh sách</button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((r) => (
          <RoomCard key={r.code} hosted={r} onSnapshot={onSnapshot} onRemove={() => setRooms((x) => x.filter((y) => y.code !== r.code))} />
        ))}
      </div>
      {rooms.length === 0 && <p className="card text-center text-ink/60">Chưa có phòng nào. Lớp 30 người: tạo 5 phòng, mỗi phòng 6 người.</p>}
    </Shell>
  );
}

function RoomCard({ hosted, onSnapshot, onRemove }: { hosted: HostedRoom; onSnapshot: (r: RoomDoc) => void; onRemove: () => void }) {
  const { room } = useRoom(hosted.code);
  const now = useNow(500);
  useAutoAdvance(room, now, hosted.hostToken);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (room) onSnapshot(room);
  }, [room, onSnapshot]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi');
    }
  }

  if (room === undefined) return <div className="card text-ink/50">Đang tải {hosted.code}…</div>;
  if (room === null)
    return (
      <div className="card flex items-center justify-between text-ink/50">
        <span>{hosted.title} · {hosted.code} (đã hết hạn)</span>
        <button type="button" className="text-sm" onClick={onRemove}>Bỏ</button>
      </div>
    );
  const top = rankPlayers(room).slice(0, 3);
  const humans = humansOf(room).length;
  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{room.title}</p>
          <p className="text-3xl font-extrabold tracking-[0.2em]">{room.code}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${room.status === 'lobby' ? 'bg-amber/25' : room.status === 'finished' ? 'bg-ink/10' : 'bg-ok/15 text-ok'}`}>{statusLabel(room)}</span>
      </div>
      <p className="text-sm text-ink/60">
        👥 {humans} người{room.status !== 'lobby' ? ` + ${room.order.length - humans} máy` : ''} · {room.settings.questionCount} câu · {room.settings.autoNextSec ? `tự chuyển ${room.settings.autoNextSec}s` : 'GV bấm chuyển'}
      </p>
      {room.status === 'lobby' ? (
        <p className="min-h-[3rem] text-sm">{room.order.map((id) => room.players[id]?.name).join(', ') || <span className="text-ink/40">Chưa có ai vào…</span>}</p>
      ) : (
        <ol className="min-h-[3rem] space-y-0.5 text-sm">
          {top.map((p, i) => (
            <li key={p.id} className="flex justify-between"><span className="truncate">{i + 1}. {p.bot ? '🤖 ' : ''}{p.name}</span><b className="tabular-nums">{p.score}</b></li>
          ))}
        </ol>
      )}
      <ErrorNote text={error} />
      <div className="flex flex-wrap gap-2">
        {room.status === 'lobby' && <button type="button" className="btn-primary px-3 py-1.5 text-sm" disabled={!humans} onClick={() => run(() => api.start(room.code, hosted.hostToken))}>▶ Bắt đầu</button>}
        {room.status === 'reveal' && <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={() => run(() => api.advance(room.code, { hostToken: hosted.hostToken, expectStatus: 'reveal', expectQIndex: room.qIndex }))}>Câu tiếp →</button>}
        <a href={`/gv/${room.code}`} target="_blank" rel="noreferrer" className="btn-dark px-3 py-1.5 text-sm">🖥 Màn hình chiếu</a>
        {(room.status === 'question' || room.status === 'reveal') && (
          <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => window.confirm(`Kết thúc sớm ${room.title}?`) && run(() => api.end(room.code, hosted.hostToken))}>Kết thúc</button>
        )}
        <button type="button" className="btn-ghost px-3 py-1.5 text-sm" title={joinUrl(room.code)} onClick={() => void navigator.clipboard?.writeText(joinUrl(room.code))}>📋 Link</button>
        {room.status === 'finished' && <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={onRemove}>Bỏ khỏi danh sách</button>}
      </div>
    </div>
  );
}
