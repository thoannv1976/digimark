import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BOT_LEVEL_LABEL, MAX_SEATS, type AnswerInput, type HintPayload, type RoomDoc } from '@arena/types';
import { CategoryStats, ErrorNote, Leaderboard, MoodleBanner, PlayerName, Qr, Shell, TimerBar, joinUrl } from '../components/common';
import { AnswerArea, AnswerReview, CategoryChip, QuestionHeader } from '../components/QuestionView';
import { api } from '../lib/api';
import { MarketPlay } from '../market/MarketPlay';
import { asMarket, useMarketAutoAdvance } from '../market/parts';
import { answeredCount, humansOf, rankPlayers, useAutoAdvance, useNow, useRoom } from '../lib/hooks';
import { clearSession, getHint, getLti, getName, getSession, setHint, setName, setSession, type Session } from '../lib/storage';

export function Play() {
  const code = (useParams().code ?? '').toUpperCase();
  const [session, setSess] = useState<Session | null>(() => getSession(code));
  const { room, error } = useRoom(code);
  const now = useNow();
  useAutoAdvance(room, now, session?.hostToken);
  const isMarket = (room as unknown as { game?: string } | null | undefined)?.game === 'market-share';
  useMarketAutoAdvance(room && isMarket ? asMarket(room) : null, now, session?.hostToken);

  // Each new screen (question, answer, final) starts at the top.
  const screenKey = room ? `${room.status}:${room.qIndex}` : '';
  useEffect(() => {
    if (screenKey) window.scrollTo({ top: 0 });
  }, [screenKey]);

  // Removed from the lobby by the host: forget the seat.
  useEffect(() => {
    if (room && session?.playerId && !room.players[session.playerId]) {
      clearSession(code);
      setSess(null);
    }
  }, [room, session, code]);

  if (room === undefined) return <Shell><p className="card text-center text-ink/60">Đang mở phòng {code}…</p></Shell>;
  if (room === null)
    return (
      <Shell>
        <div className="card space-y-3 text-center">
          <p className="text-lg font-bold">Không tìm thấy phòng {code}</p>
          <p className="text-ink/60">Kiểm tra lại mã phòng trên màn hình của giảng viên.</p>
          <Link to="/" className="btn-dark">Về trang chủ</Link>
        </div>
      </Shell>
    );
  if (!session?.playerId || !session.playerToken)
    return <JoinForm room={room} onJoined={(s) => { setSession(code, s); setSess(s); }} />;

  const me = room.players[session.playerId];
  if (!me) return null;
  if (isMarket) {
    const m = asMarket(room);
    const st = m.standings[session.playerId];
    return (
      <Shell right={<span className="max-w-[55%] truncate text-sm text-white/80">{me.name}{st ? <> · hạng <b className="text-amber">{st.rank}</b></> : null}</span>}>
        <ErrorNote text={error} />
        <MarketPlay room={m} session={session} now={now} />
      </Shell>
    );
  }
  return (
    <Shell right={<span className="max-w-[45%] truncate text-sm text-white/80">{me.name} · <b className="text-amber">{me.score}</b></span>}>
      <ErrorNote text={error} />
      {room.status === 'lobby' && <Lobby room={room} session={session} />}
      {room.status === 'question' && <QuestionScreen key={room.qIndex} room={room} session={session} now={now} />}
      {room.status === 'reveal' && <RevealScreen room={room} session={session} now={now} />}
      {room.status === 'finished' && <FinalScreen room={room} session={session} />}
    </Shell>
  );
}

function JoinForm({ room, onJoined }: { room: RoomDoc; onJoined: (s: Session) => void }) {
  const lti = getLti();
  const moodle = lti?.role === 'learner' ? lti : null;
  const [name, setNameState] = useState(moodle ? moodle.name : getName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = room.order.length >= MAX_SEATS;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setName(name.trim());
      const r = await api.join(room.code, name.trim(), moodle?.session);
      onJoined({ playerId: r.playerId, playerToken: r.playerToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không vào được phòng.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <MoodleBanner lti={moodle} role="learner" />
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <p className="text-sm text-ink/60">Phòng {room.code}</p>
          <h1 className="text-2xl font-extrabold">{room.title}</h1>
          <p className="mt-1 text-sm text-ink/60">
            {(room as unknown as { game?: string }).game === 'market-share' ? 'Đấu trường Thị phần · ' : 'Thám tử AI · '}
            {room.order.length}/{MAX_SEATS} người · {room.status === 'lobby' ? 'đang chờ bắt đầu' : room.status === 'finished' ? 'đã kết thúc' : (room as unknown as { game?: string }).game === 'market-share' ? 'trận đã bắt đầu' : 'đang chơi (vẫn vào được)'}
          </p>
        </div>
        {room.status === 'finished' || full ? (
          <p className="rounded-xl bg-ink/5 p-3 text-center font-medium">{full ? 'Phòng đã đủ 6 người.' : 'Phòng đã kết thúc.'}</p>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="pname">Tên hiển thị</label>
              <input id="pname" className="input text-lg" autoFocus maxLength={24} value={name} onChange={(e) => setNameState(e.target.value)} placeholder="Tên của bạn" />
            </div>
            <ErrorNote text={error} />
            <button className="btn-primary w-full text-lg" disabled={busy || !name.trim()}>Vào phòng</button>
          </>
        )}
      </form>
    </Shell>
  );
}

function Lobby({ room, session }: { room: RoomDoc; session: Session }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = Boolean(session.hostToken);
  const free = MAX_SEATS - room.order.length;
  async function start() {
    setBusy(true);
    setError(null);
    try {
      await api.start(room.code, session.hostToken!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không bắt đầu được.');
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="card text-center">
        <p className="text-sm text-ink/60">{room.title}</p>
        <p className="mt-1 text-4xl font-extrabold tracking-[0.25em]">{room.code}</p>
        {isHost && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <Qr text={joinUrl(room.code)} size={170} />
            <p className="text-sm text-ink/60">Bạn bè quét mã hoặc vào trang chủ, nhập mã phòng.</p>
          </div>
        )}
      </div>
      <div className="card">
        <h2 className="mb-2 font-bold">Người chơi ({room.order.length}/{MAX_SEATS})</h2>
        <ul className="grid gap-1.5">
          {room.order.map((id) => {
            const p = room.players[id]!;
            return (
              <li key={id} className={`flex items-center justify-between rounded-xl px-3 py-2 ring-1 ${id === session.playerId ? 'bg-amber/20 ring-amber' : 'ring-ink/10'}`}>
                <PlayerName p={p} />
                {isHost && id !== session.playerId && (
                  <button type="button" className="text-sm text-bad" onClick={() => void api.kick(room.code, session.hostToken!, id)}>Xóa</button>
                )}
              </li>
            );
          })}
        </ul>
        {room.settings.fillBots && free > 0 && <p className="mt-2 text-sm text-ink/60">Khi bắt đầu, {free} ghế trống sẽ do máy chơi (mức {BOT_LEVEL_LABEL[room.settings.botLevel]}).</p>}
      </div>
      {isHost ? (
        <>
          <ErrorNote text={error} />
          <button type="button" className="btn-primary w-full text-lg" disabled={busy} onClick={start}>Bắt đầu ({room.settings.questionCount} câu)</button>
        </>
      ) : (
        <p className="card text-center font-medium text-ink/70">⏳ Chờ {room.hostPlays ? 'chủ phòng' : 'giảng viên'} bắt đầu…</p>
      )}
    </div>
  );
}

function QuestionScreen({ room, session, now }: { room: RoomDoc; session: Session; now: number }) {
  const cur = room.current!;
  const q = cur.q;
  const me = room.players[session.playerId!]!;
  const [sent, setSent] = useState(Boolean(room.answered[session.playerId!]));
  const [error, setError] = useState<string | null>(null);
  const [hint, setHintState] = useState<HintPayload | null>(() => getHint(room.code, room.qIndex));
  const [hintBusy, setHintBusy] = useState(false);
  const answered = sent || Boolean(room.answered[session.playerId!]);
  const waiting = now < cur.openedAt;
  const timeUp = now > cur.deadline;
  const count = answeredCount(room, now);

  async function submit(input: AnswerInput) {
    if (answered) return;
    setSent(true);
    setError(null);
    try {
      await api.answer(room.code, session.playerId!, session.playerToken!, room.qIndex, input);
    } catch (err) {
      if (err instanceof Error && !/đã trả lời/.test(err.message)) {
        setError(err.message);
        if (!/Hết giờ|đã đóng|đã chuyển/.test(err.message)) setSent(false);
      }
    }
  }
  const [confirmHint, setConfirmHint] = useState(false);
  async function askHint() {
    if (hintBusy || hint) return;
    if (!confirmHint) {
      setConfirmHint(true);
      return;
    }
    setConfirmHint(false);
    setHintBusy(true);
    try {
      const r = await api.hint(room.code, session.playerId!, session.playerToken!, room.qIndex);
      setHint(room.code, room.qIndex, r.hint);
      setHintState(r.hint);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không dùng được Kiểm chứng.');
    } finally {
      setHintBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink/60">Câu {room.qIndex + 1}/{room.qTotal}</span>
        <CategoryChip category={q.category} />
        {me.streak >= 2 ? <span className="text-sm font-bold text-orange-600">🔥 {me.streak}</span> : <span className="w-8" />}
      </div>
      {waiting ? (
        <div className="rounded-xl bg-ink px-4 py-2 text-center font-bold text-amber">Chuẩn bị… {Math.ceil((cur.openedAt - now) / 1000)}</div>
      ) : (
        <TimerBar openedAt={cur.openedAt} deadline={cur.deadline} now={now} />
      )}
      <div className="card space-y-4">
        <QuestionHeader q={q} />
        {answered ? (
          <div className="pop rounded-xl bg-ok/10 p-4 text-center">
            <p className="text-lg font-bold text-ok">✓ Đã gửi câu trả lời</p>
            <p className="text-sm text-ink/60">{count.done}/{count.total} người đã trả lời · chờ đáp án…</p>
          </div>
        ) : timeUp ? (
          <p className="rounded-xl bg-ink/5 p-4 text-center font-bold">⏰ Hết giờ</p>
        ) : (
          <AnswerArea q={q} disabled={waiting} hint={hint} onSubmit={submit} />
        )}
        <ErrorNote text={error} />
      </div>
      {!answered && !timeUp && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-ink/60">{count.done}/{count.total} đã trả lời</span>
          {confirmHint ? (
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-ink/60">Câu này còn ½ điểm</span>
              <button type="button" className="btn-dark px-3 py-1.5 text-sm" onClick={askHint}>Dùng</button>
              <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setConfirmHint(false)}>Thôi</button>
            </span>
          ) : (
            <button type="button" className="btn-ghost text-sm" disabled={waiting || hintBusy || Boolean(hint) || me.hintsLeft <= 0} onClick={askHint}>
              🔍 Kiểm chứng ({me.hintsLeft})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RevealScreen({ room, session, now }: { room: RoomDoc; session: Session; now: number }) {
  const reveal = room.reveal!;
  const q = room.current!.q;
  const mine = reveal.results[session.playerId!];
  const isHost = Boolean(session.hostToken);
  const [busy, setBusy] = useState(false);
  const last = room.qIndex + 1 >= room.qTotal;
  let title = '⏰ Hết giờ – chưa trả lời';
  let tone = 'bg-ink/5';
  if (mine?.answered) {
    if (mine.fraction >= 1) { title = '🎉 Chính xác!'; tone = 'bg-ok/15 text-ok'; }
    else if (mine.fraction > 0) { title = '👍 Đúng một phần'; tone = 'bg-amber/25'; }
    else { title = '✗ Chưa đúng'; tone = 'bg-bad/10 text-bad'; }
  }
  const autoLeft = room.settings.autoNextSec > 0 ? Math.max(0, Math.ceil((reveal.revealedAt + room.settings.autoNextSec * 1000 - now) / 1000)) : null;
  const rank = rankPlayers(room).findIndex((p) => p.id === session.playerId) + 1;
  async function next() {
    setBusy(true);
    try {
      await api.advance(room.code, { hostToken: session.hostToken!, expectStatus: 'reveal', expectQIndex: room.qIndex });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className={`pop flex items-center justify-between rounded-2xl px-4 py-3 ${tone}`}>
        <span className="text-xl font-extrabold">{title}</span>
        <span className="text-2xl font-extrabold tabular-nums">{mine ? (mine.points > 0 ? `+${mine.points}` : mine.points) : 0}</span>
      </div>
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink/60">Câu {room.qIndex + 1}/{room.qTotal}</span>
          <CategoryChip category={q.category} />
        </div>
        <p className="font-bold">{q.prompt}</p>
        <AnswerReview q={q} answerKey={reveal.key} {...(mine?.input ? { mine: mine.input } : {})} {...(reveal.distribution ? { distribution: reveal.distribution } : {})} />
        <div className="rounded-xl bg-amber/15 p-3 text-[15px] leading-relaxed">
          <b>Vì sao:</b> {reveal.explanation}
          {reveal.source && <p className="mt-1 text-xs text-ink/50">Nguồn: {reveal.source}</p>}
        </div>
      </div>
      <div className="card">
        <h2 className="mb-2 font-bold">Bảng xếp hạng · bạn đứng thứ {rank}</h2>
        <Leaderboard room={room} me={session.playerId!} reveal={reveal} />
      </div>
      {isHost ? (
        <button type="button" className="btn-primary w-full text-lg" disabled={busy} onClick={next}>
          {last ? 'Xem kết quả chung cuộc' : 'Câu tiếp →'} {autoLeft !== null ? `(${autoLeft}s)` : ''}
        </button>
      ) : (
        <p className="text-center text-sm text-ink/60">{autoLeft !== null ? `${last ? 'Kết quả chung cuộc' : 'Câu tiếp'} sau ${autoLeft}s…` : `Chờ ${room.hostPlays ? 'chủ phòng' : 'giảng viên'} chuyển câu…`}</p>
      )}
    </div>
  );
}

function FinalScreen({ room, session }: { room: RoomDoc; session: Session }) {
  const nav = useNavigate();
  const list = rankPlayers(room);
  const me = room.players[session.playerId!]!;
  const rank = list.findIndex((p) => p.id === me.id) + 1;
  const [busy, setBusy] = useState(false);
  const soloHost = Boolean(session.hostToken) && humansOf(room).length === 1;
  async function again() {
    setBusy(true);
    try {
      const lti = getLti();
      const r = await api.createRoom({ hostPlays: true, hostName: me.name, settings: room.settings, ...(me.lms && lti?.role === 'learner' ? { ltiSession: lti.session } : {}) });
      setSession(r.code, { playerId: r.playerId!, playerToken: r.playerToken!, hostToken: r.hostToken });
      await api.start(r.code, r.hostToken);
      nav(`/p/${r.code}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="pop card text-center">
        <p className="text-5xl">{rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎯'}</p>
        <p className="mt-2 text-2xl font-extrabold">Hạng {rank}/{list.length}</p>
        <p className="text-ink/60">{me.score} điểm · đúng {me.correct}/{room.qTotal} câu · chuỗi dài nhất {me.bestStreak}</p>
      </div>
      {me.lms && (
        <div className={`card text-center text-sm font-medium ${room.lmsStatus?.[me.id] === 'error' ? 'text-bad' : 'text-ok'}`}>
          {room.lmsStatus?.[me.id] === 'sent'
            ? `✓ Đã gửi điểm ${Math.round((me.correct / Math.max(1, room.qIndex + 1)) * 1000) / 10}/100 về Sổ điểm Moodle (Moodle giữ lần cao nhất).`
            : room.lmsStatus?.[me.id] === 'error'
              ? 'Chưa gửi được điểm về Moodle. Báo giảng viên để kiểm tra.'
              : 'Đang gửi điểm về Moodle…'}
        </div>
      )}
      <div className="card">
        <h2 className="mb-3 font-bold">Điểm mạnh, điểm yếu của bạn</h2>
        <CategoryStats p={me} />
      </div>
      <div className="card">
        <h2 className="mb-2 font-bold">Bảng xếp hạng chung cuộc</h2>
        <Leaderboard room={room} me={me.id} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {soloHost && <button type="button" className="btn-primary" disabled={busy} onClick={again}>Chơi lại với máy</button>}
        <Link to="/" className="btn-ghost">Về trang chủ</Link>
      </div>
    </div>
  );
}
