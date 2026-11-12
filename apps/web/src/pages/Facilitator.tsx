import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BOT_LEVEL_LABEL, CATEGORIES, CATEGORY_LABEL, MAX_SEATS, type BotLevel, type Category, type RoomDoc } from '@arena/types';
import { ErrorNote, MoodleBanner, Shell, abmCsv, downloadText, joinUrl, marketCsv, resultsCsv, statusLabel } from '../components/common';
import { MONTHS, type AbmRoomDoc } from '@arena/abm';
import { asAbm, isAbmRoom, rankedIds as abmRanked, useAbmAutoAdvance } from '../abm/parts';
import type { MarketRoomDoc } from '@arena/market';
import { asMarket, rankedIds, useMarketAutoAdvance } from '../market/parts';
import { api } from '../lib/api';
import { humansOf, rankPlayers, useAutoAdvance, useNow, useRoom } from '../lib/hooks';
import { getHostedRooms, getLti, setHostedRooms, type HostedRoom } from '../lib/storage';

export function Facilitator() {
  const [rooms, setRooms] = useState<HostedRoom[]>(getHostedRooms);
  const lti = getLti();
  const [game, setGame] = useState<'ai-detective' | 'market-share' | 'key-accounts'>(lti?.activity === 'market-share' || lti?.activity === 'key-accounts' ? lti.activity : 'ai-detective');
  const [decideMin, setDecideMin] = useState(5);
  const [monthMin, setMonthMin] = useState(4);
  const [briefMin, setBriefMin] = useState(3);
  const [bidMin, setBidMin] = useState(4);
  const [resultsSec, setResultsSec] = useState(0);
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
        const r =
          game === 'key-accounts'
            ? await api.createRoom({ game, hostPlays: false, title, settings: { monthSec: monthMin * 60, briefSec: briefMin * 60, bidSec: bidMin * 60, resultsSec, botLevel: level, fillBots } })
            : game === 'market-share'
            ? await api.createRoom({ game, hostPlays: false, title, settings: { quarters: 5, decideSec: decideMin * 60, resultsSec, botLevel: level, fillBots } })
            : await api.createRoom({ hostPlays: false, title, settings: { questionCount: questions, botLevel: level, fillBots, autoNextSec: autoNext, categories: cats } });
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
  const liveQuiz = live.filter((r) => (r as unknown as { game?: string }).game === 'ai-detective' || !(r as unknown as { game?: string }).game);
  const liveAbm = live.filter((r) => isAbmRoom(r)).map((r) => r as unknown as AbmRoomDoc);
  const liveMarket = live.filter((r) => (r as unknown as { game?: string }).game === 'market-share').map((r) => r as unknown as MarketRoomDoc);
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
      <h1 className="mb-1 text-2xl font-extrabold">Bảng điều khiển giảng viên · DIGIMARK Arena</h1>
      <p className="mb-3 text-ink/60">Tạo nhiều phòng 6 người, chiếu mã phòng lên màn hình, theo dõi tất cả phòng cùng lúc và xuất kết quả.</p>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {([
          ['market-share', '📈 Game 1 · Đấu trường Thị phần', 'Mô phỏng 5 quý thị trường xăng dầu – gas (tình huống A), khoảng 40 phút.'],
          ['ai-detective', '🔍 Game 2 · Thám tử AI', 'Đấu nhanh 10–25 câu (CĐ3–CĐ4), khoảng 15 phút.'],
          ['key-accounts', '🤝 Game 3 · Săn hợp đồng trọng điểm', 'ABM 8 nhà máy, nhóm mua 5 vai (CĐ2, tình huống C), khoảng 35–40 phút.'],
        ] as const).map(([id, name, note]) => (
          <button key={id} type="button" onClick={() => setGame(id)} className={`rounded-2xl px-4 py-3 text-left ring-1 ${game === id ? 'bg-ink text-white ring-ink' : 'bg-white ring-ink/15 hover:bg-amber/10'}`}>
            <p className="font-bold">{name}</p>
            <p className={`text-sm ${game === id ? 'text-white/70' : 'text-ink/60'}`}>{note}</p>
          </button>
        ))}
      </div>

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
          {game === 'key-accounts' ? (
            <>
              <div>
                <label className="label" htmlFor="mm">Mỗi tháng tiếp cận</label>
                <select id="mm" className="input" value={monthMin} onChange={(e) => setMonthMin(Number(e.target.value))}>
                  {[3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} phút</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="bm">Đọc hồ sơ (thêm vào tháng 1)</label>
                <select id="bm" className="input" value={briefMin} onChange={(e) => setBriefMin(Number(e.target.value))}>
                  {[0, 2, 3, 5].map((n) => <option key={n} value={n}>{n ? `${n} phút` : 'Không'}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="bid">Vòng nộp hồ sơ</label>
                <select id="bid" className="input" value={bidMin} onChange={(e) => setBidMin(Number(e.target.value))}>
                  {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} phút</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="rs3">Sang vòng mới</label>
                <select id="rs3" className="input" value={resultsSec} onChange={(e) => setResultsSec(Number(e.target.value))}>
                  <option value={0}>Giảng viên bấm</option>
                  {[60, 90, 120].map((n) => <option key={n} value={n}>Tự động sau {n} giây</option>)}
                </select>
              </div>
            </>
          ) : game === 'market-share' ? (
            <>
              <div>
                <label className="label" htmlFor="dm">Thời gian quyết định mỗi quý</label>
                <select id="dm" className="input" value={decideMin} onChange={(e) => setDecideMin(Number(e.target.value))}>
                  {[3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} phút</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="rs">Sang quý mới</label>
                <select id="rs" className="input" value={resultsSec} onChange={(e) => setResultsSec(Number(e.target.value))}>
                  <option value={0}>Giảng viên bấm</option>
                  {[60, 90, 120].map((n) => <option key={n} value={n}>Tự động sau {n} giây</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
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
          {game === 'ai-detective' && <div>
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
          </div>}
        </div>
        <div className="flex flex-col justify-end gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={createRooms}>{busy ? 'Đang tạo…' : `+ Tạo ${count} phòng`}</button>
        </div>
      </section>

      <ErrorNote text={error} />

      {rooms.length > 0 && (
        <div className="my-4 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-dark" disabled={!waiting.length} onClick={startAll}>▶ Bắt đầu {waiting.length} phòng đang chờ</button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!live.length}
            onClick={() => {
              const day = new Date().toISOString().slice(0, 10);
              if (liveQuiz.length) downloadText(`ket-qua-tham-tu-ai-${day}.csv`, resultsCsv(liveQuiz));
              if (liveMarket.length) downloadText(`ket-qua-dau-truong-thi-phan-${day}.csv`, marketCsv(liveMarket));
              if (liveAbm.length) downloadText(`ket-qua-san-hop-dong-${day}.csv`, abmCsv(liveAbm));
            }}
          >
            ⬇ Xuất kết quả (Excel/CSV)
          </button>
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
  const isMarket = (room as unknown as { game?: string } | null | undefined)?.game === 'market-share';
  useMarketAutoAdvance(room && isMarket ? asMarket(room) : null, now, hosted.hostToken);
  const isAbm = isAbmRoom(room);
  useAbmAutoAdvance(room && isAbm ? asAbm(room) : null, now, hosted.hostToken);
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
  const top = isMarket || isAbm ? [] : rankPlayers(room).slice(0, 3);
  const m = isMarket ? asMarket(room) : null;
  const k = isAbm ? asAbm(room) : null;
  const humans = humansOf(room).length;
  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{room.title} <span className="text-xs font-normal text-ink/50">{k ? '· Săn hợp đồng' : m ? '· Thị phần' : '· Thám tử AI'}</span></p>
          <p className="text-3xl font-extrabold tracking-[0.2em]">{room.code}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${room.status === 'lobby' ? 'bg-amber/25' : room.status === 'finished' ? 'bg-ink/10' : 'bg-ok/15 text-ok'}`}>{statusLabel(room)}</span>
      </div>
      <p className="text-sm text-ink/60">
        👥 {humans} người{room.status !== 'lobby' ? ` + ${room.order.length - humans} máy` : ''} ·{' '}
        {k ? `${MONTHS} tháng + nộp hồ sơ · ${k.settings.monthSec ? `${Math.round(k.settings.monthSec / 60)} phút/tháng` : 'không giới hạn'}` : m ? `${m.quarters} quý · ${m.settings.decideSec ? `${Math.round(m.settings.decideSec / 60)} phút/quý` : 'không giới hạn'}` : `${room.settings.questionCount} câu · ${room.settings.autoNextSec ? `tự chuyển ${room.settings.autoNextSec}s` : 'GV bấm chuyển'}`}
      </p>
      {room.status === 'lobby' ? (
        <p className="min-h-[3rem] text-sm">{room.order.map((id) => room.players[id]?.name).join(', ') || <span className="text-ink/40">Chưa có ai vào…</span>}</p>
      ) : k ? (
        <ol className="min-h-[3rem] space-y-0.5 text-sm">
          {k.status === 'finished' &&
            abmRanked(k).slice(0, 3).map((id) => (
              <li key={id} className="flex justify-between">
                <span className="truncate">{k.standings[id]?.rank ?? '–'}. {k.players[id]?.bot ? '🤖 ' : ''}{k.players[id]?.name}</span>
                <b className="tabular-nums">{k.standings[id]?.contracts ?? 0} HĐ · {(k.standings[id]?.net ?? 0).toFixed(1)} tỷ</b>
              </li>
            ))}
          {k.status === 'decide' && <li className="text-ink/60">Đã nộp: {k.order.filter((id) => k.players[id]?.bot || k.submitted[id]).length}/{k.order.length}</li>}
          {k.status === 'results' && <li className="text-ink/60">Đang xem kết quả tháng {k.round}</li>}
        </ol>
      ) : m ? (
        <ol className="min-h-[3rem] space-y-0.5 text-sm">
          {rankedIds(m).slice(0, 3).map((id) => (
            <li key={id} className="flex justify-between">
              <span className="truncate">{m.standings[id]?.rank ?? '–'}. {m.players[id]?.bot ? '🤖 ' : ''}{m.players[id]?.name}</span>
              <b className="tabular-nums">{m.standings[id]?.valueIndex.toFixed(1) ?? '–'}</b>
            </li>
          ))}
          {m.status === 'decide' && <li className="text-ink/60">Đã nộp: {m.order.filter((id) => m.players[id]?.bot || m.submitted[id]).length}/{m.order.length}</li>}
        </ol>
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
        {m?.status === 'decide' && m.deadline !== null && <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => run(() => api.extend(m.code, hosted.hostToken))}>+1 phút</button>}
        {m?.status === 'decide' && <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => window.confirm(`Chốt quý ${m.quarter} của ${m.title} ngay?`) && run(() => api.advance(m.code, { hostToken: hosted.hostToken, expectStatus: 'decide', expectQuarter: m.quarter }))}>Chốt quý</button>}
        {k?.status === 'decide' && k.deadline !== null && <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => run(() => api.extend(k.code, hosted.hostToken))}>+1 phút</button>}
        {k?.status === 'decide' && <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => window.confirm(`Chốt ${k.round > MONTHS ? 'hồ sơ' : `tháng ${k.round}`} của ${k.title} ngay?`) && run(() => api.advance(k.code, { hostToken: hosted.hostToken, expectStatus: 'decide', expectQuarter: k.round }))}>{k.round > MONTHS ? 'Trao hợp đồng' : 'Chốt tháng'}</button>}
        {k?.status === 'results' && <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={() => run(() => api.advance(k.code, { hostToken: hosted.hostToken, expectStatus: 'results', expectQuarter: k.round }))}>{k.round >= MONTHS ? 'Nộp hồ sơ →' : 'Tháng tiếp →'}</button>}
        {k?.status === 'finished' && !k.hidden && <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => run(() => api.reveal(k.code, hosted.hostToken))}>🔓 Lật phần ẩn</button>}
        {m?.status === 'results' && <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={() => run(() => api.advance(m.code, { hostToken: hosted.hostToken, expectStatus: 'results', expectQuarter: m.quarter }))}>Quý tiếp →</button>}
        <a href={`/gv/${room.code}`} target="_blank" rel="noreferrer" className="btn-dark px-3 py-1.5 text-sm">🖥 Màn hình chiếu</a>
        {(room.status === 'question' || room.status === 'reveal' || ((m || k) && ((room.status as string) === 'decide' || (room.status as string) === 'results'))) && (
          <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => window.confirm(`Kết thúc sớm ${room.title}?`) && run(() => api.end(room.code, hosted.hostToken))}>Kết thúc</button>
        )}
        <button type="button" className="btn-ghost px-3 py-1.5 text-sm" title={joinUrl(room.code)} onClick={() => void navigator.clipboard?.writeText(joinUrl(room.code))}>📋 Link</button>
        {room.status === 'finished' && <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={onRemove}>Bỏ khỏi danh sách</button>}
      </div>
    </div>
  );
}
