import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BUDGET_INFO,
  BUDGET_KEYS,
  BUDGET_STEP,
  CAPABILITY_INFO,
  CARDS,
  CARD_INFO,
  QUARTER_BUDGET,
  SEGMENTS,
  SEGMENT_INFO,
  type BudgetKey,
  type CardId,
  type MarketDecision,
  type MarketMe,
  type MarketRoomDoc,
  type SegmentId,
} from '@arena/market';
import { BOT_LEVEL_LABEL, MAX_SEATS } from '@arena/types';
import { ErrorNote, Qr, joinUrl } from '../components/common';
import { api } from '../lib/api';
import { getLti, setSession, type Session } from '../lib/storage';
import { Countdown, KpiTable, ScorecardBars, SegmentTable, ShareChart, Standings, pct, rankedIds, ty, useMarketMe } from './parts';

const r1 = (v: number) => Math.round(v * 10) / 10;
const FACTOR_LABEL: Record<string, string> = { ...CAPABILITY_INFO, price: 'Giá, khuyến mại', reviews: 'Đánh giá Google Maps' };

export function MarketPlay({ room, session, now }: { room: MarketRoomDoc; session: Session; now: number }) {
  const me = useMarketMe(room, session.playerId, session.playerToken);
  if (room.status === 'lobby') return <MarketLobby room={room} session={session} />;
  if (room.status === 'decide') return <DecideScreen key={room.quarter} room={room} session={session} now={now} me={me} />;
  if (room.status === 'results') return <ResultsScreen room={room} session={session} me={me} now={now} />;
  return <FinalScreen room={room} session={session} me={me} />;
}

function MarketLobby({ room, session }: { room: MarketRoomDoc; session: Session }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = Boolean(session.hostToken);
  const free = MAX_SEATS - room.order.length;
  return (
    <div className="space-y-4">
      <div className="card text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-ink/50">Game 1 · Đấu trường Thị phần</p>
        <p className="text-sm text-ink/60">{room.title}</p>
        <p className="mt-1 text-4xl font-extrabold tracking-[0.25em]">{room.code}</p>
        {isHost && room.hostPlays && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <Qr text={joinUrl(room.code)} size={160} />
            <p className="text-sm text-ink/60">Bạn bè quét mã hoặc nhập mã phòng ở trang chủ.</p>
          </div>
        )}
      </div>
      <Briefing />
      <div className="card">
        <h2 className="mb-2 font-bold">Các chuỗi ({room.order.length}/{MAX_SEATS})</h2>
        <ul className="grid gap-1.5">
          {room.order.map((id) => (
            <li key={id} className={`rounded-xl px-3 py-2 ring-1 ${id === session.playerId ? 'bg-amber/20 ring-amber' : 'ring-ink/10'}`}>{room.players[id]!.name}</li>
          ))}
        </ul>
        {room.settings.fillBots && free > 0 && <p className="mt-2 text-sm text-ink/60">Khi bắt đầu, {free} chuỗi còn lại do máy điều hành (mức {BOT_LEVEL_LABEL[room.settings.botLevel]}).</p>}
      </div>
      {isHost ? (
        <>
          <ErrorNote text={error} />
          <button
            type="button"
            className="btn-primary w-full text-lg"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.start(room.code, session.hostToken!);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Không bắt đầu được.');
                setBusy(false);
              }
            }}
          >
            Bắt đầu {room.quarters} quý
          </button>
        </>
      ) : (
        <p className="card text-center font-medium text-ink/70">⏳ Chờ {room.hostPlays ? 'chủ phòng' : 'giảng viên'} bắt đầu…</p>
      )}
    </div>
  );
}

export function Briefing({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  return (
    <div className="card">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <h2 className="font-bold">📋 Tình hình thị trường</h2>
        <span className="text-sm text-ink/50">{open ? 'Thu gọn' : 'Xem'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink/80">
          <p>
            Bạn là <b>Giám đốc marketing</b> của một chuỗi 20 cửa hàng xăng dầu và gas trong thành phố. 6 chuỗi xuất phát như nhau: điểm Google Maps 3,6★, chưa có thành viên số, ngân sách <b>{QUARTER_BUDGET} tỷ/quý</b>.
          </p>
          <p>
            Mỗi quý: chọn <b>định vị</b>, tối đa <b>2 phân khúc mục tiêu</b>, chia ngân sách cho 8 hạng mục và phản ứng với <b>sự kiện</b> của quý.
          </p>
          <p>
            Thắng theo <b>giá trị doanh nghiệp</b>: lợi nhuận 40%, thị phần theo giá trị 30%, điểm sao 20%, ROI marketing 10%. Ban lãnh đạo còn đặt <b>4 mục tiêu 2027</b>: doanh thu ngoài nhiên liệu ≥ 3%, mua lại gas ≥ 65%, điểm sao ≥ 4,3, phản hồi sự cố đúng cách.
          </p>
        </div>
      )}
    </div>
  );
}

function blankBudget(): Record<BudgetKey, number> {
  return { ads: 0, maps: 0, crm: 0, app: 0, training: 0, green: 0, promo: 0, research: 0 };
}

function DecideScreen({ room, session, now, me }: { room: MarketRoomDoc; session: Session; now: number; me: MarketMe | null }) {
  const pid = session.playerId!;
  const last = me?.reports[me.reports.length - 1];
  const special = room.event?.special?.playerId === pid ? room.event.special : null;
  const eventOptions = special ? special.options : (room.event?.options ?? []);
  const [position, setPosition] = useState<CardId | null>(null);
  const [targets, setTargets] = useState<SegmentId[]>([]);
  const [budget, setBudget] = useState<Record<BudgetKey, number>>(blankBudget());
  const [eventChoice, setEventChoice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);

  // Start from what was already sent this quarter, else last quarter's plan.
  useEffect(() => {
    if (loaded || !me) return;
    const base: MarketDecision | null = me.pending ?? last?.decision ?? null;
    if (base) {
      setPosition(base.position);
      setTargets(base.targets);
      setBudget({ ...blankBudget(), ...base.budget });
    }
    if (me.pending?.eventChoice) setEventChoice(me.pending.eventChoice);
    if (me.pending) setSentAt(Date.now());
    setLoaded(true);
  }, [me, last, loaded]);

  const eventCost = eventOptions.find((o) => o.id === eventChoice)?.cost ?? 0;
  const used = r1(BUDGET_KEYS.reduce((a, k) => a + budget[k], 0) + eventCost);
  const left = r1(QUARTER_BUDGET - used);
  const submittedCount = room.order.filter((id) => room.players[id]?.bot || room.submitted[id]).length;
  const timeUp = room.deadline !== null && now > room.deadline;
  const ready = position && (!room.event || eventChoice) && left >= 0;

  const step = (k: BudgetKey, d: number) =>
    setBudget((b) => {
      const v = r1(Math.max(0, b[k] + d));
      if (d > 0 && r1(used + BUDGET_STEP) > QUARTER_BUDGET) return b;
      return { ...b, [k]: v };
    });
  const toggleTarget = (s: SegmentId) => setTargets((t) => (t.includes(s) ? t.filter((x) => x !== s) : t.length >= 2 ? [t[1]!, s] : [...t, s]));

  async function submit() {
    if (!ready || !position) return;
    setBusy(true);
    setError(null);
    try {
      await api.decide(room.code, pid, session.playerToken!, room.quarter, { position, targets, budget, ...(eventChoice ? { eventChoice } : {}) });
      setSentAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không nộp được.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-lg font-extrabold">Quý {room.quarter}/{room.quarters}</span>
        <Countdown deadline={room.deadline} now={now} />
      </div>
      {room.quarter === 1 && <Briefing compact />}
      {room.news.length > 0 && (
        <div className="rounded-2xl bg-ink px-4 py-3 text-sm text-white/90">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-amber">Tin quý trước</p>
          {room.news.map((n) => (
            <p key={n}>📰 {n}</p>
          ))}
        </div>
      )}

      {room.event && (
        <section className={`card space-y-3 ${special ? 'ring-2 ring-bad' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink/50">Sự kiện quý {room.quarter}</p>
          <h2 className={`text-lg font-extrabold ${special ? 'text-bad' : ''}`}>{special ? special.title : room.event.title}</h2>
          <p className="text-[15px] leading-relaxed text-ink/80">{special ? special.text : room.event.text}</p>
          <div className="grid gap-2">
            {eventOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setEventChoice(o.id)}
                className={`flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] ring-1 ${eventChoice === o.id ? 'bg-ink text-white ring-ink' : 'bg-white ring-ink/15 hover:bg-amber/15'}`}
              >
                <span>{o.label}</span>
                <span className="shrink-0 text-sm font-semibold opacity-80">{o.cost > 0 ? ty(o.cost) : 'miễn phí'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-bold">1. Định vị (lời hứa với khách)</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {CARDS.map((c) => (
            <button key={c} type="button" onClick={() => setPosition(c)} className={`rounded-xl px-3 py-2.5 text-left ring-1 ${position === c ? 'bg-ink text-white ring-ink' : 'bg-white ring-ink/15 hover:bg-amber/15'}`}>
              <p className="font-semibold">{CARD_INFO[c].name}</p>
              <p className={`text-sm ${position === c ? 'text-white/80' : 'text-ink/60'}`}>{CARD_INFO[c].promise}</p>
            </button>
          ))}
        </div>
        {last && position && position !== last.decision.position && <p className="text-sm text-orange-700">Đổi định vị sẽ đặt lại điểm nhất quán của thương hiệu.</p>}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">2. Phân khúc mục tiêu (tối đa 2)</h2>
        <div className="grid gap-2">
          {SEGMENTS.map((s) => {
            const on = targets.includes(s);
            const known = me?.knownPrefs[s];
            return (
              <button key={s} type="button" onClick={() => toggleTarget(s)} className={`rounded-xl px-3 py-2.5 text-left ring-1 ${on ? 'bg-amber/25 ring-2 ring-amber' : 'bg-white ring-ink/15 hover:bg-amber/10'}`}>
                <p className="font-semibold">
                  {on ? '🎯 ' : ''}
                  {SEGMENT_INFO[s].name}
                  {last && <span className="ml-2 text-xs font-normal text-ink/60">thị phần của bạn {pct(last.kpis.segShares[s], 1)}</span>}
                </p>
                <p className="text-sm text-ink/70">{SEGMENT_INFO[s].who}</p>
                <p className="text-sm italic text-ink/60">{SEGMENT_INFO[s].hint}</p>
                <p className="text-xs text-ink/50">Kênh: {SEGMENT_INFO[s].channels}</p>
                {known && (
                  <div className="mt-2 grid gap-1 rounded-lg bg-emerald-50 p-2">
                    <p className="text-xs font-semibold text-emerald-800">🔎 Nghiên cứu: điều khách coi trọng</p>
                    {Object.entries(known)
                      .sort((a, b) => b[1] - a[1])
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-xs">
                          <span>{FACTOR_LABEL[k] ?? k}</span>
                          <div className="h-1.5 rounded-full bg-emerald-100">
                            <div className="h-full rounded-full bg-ok" style={{ width: `${Math.min(100, v * 200)}%` }} />
                          </div>
                          <span className="text-right">{pct(v)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">3. Ngân sách quý</h2>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${left < 0 ? 'bg-bad/15 text-bad' : left === 0 ? 'bg-ok/15 text-ok' : 'bg-amber/25'}`}>Còn {ty(left)}</span>
        </div>
        {eventCost > 0 && <p className="text-sm text-ink/60">Đã trừ {ty(eventCost)} cho phản ứng sự kiện.</p>}
        <div className="grid gap-2">
          {BUDGET_KEYS.map((k) => (
            <div key={k} className="rounded-xl px-3 py-2 ring-1 ring-ink/10">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {BUDGET_INFO[k].name} <span className="text-xs font-normal text-ink/50">{BUDGET_INFO[k].peso !== '—' ? BUDGET_INFO[k].peso : ''}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" className="h-9 w-9 rounded-lg bg-ink/10 text-lg font-bold disabled:opacity-30" disabled={budget[k] <= 0} onClick={() => step(k, -BUDGET_STEP)} aria-label={`Giảm ${BUDGET_INFO[k].name}`}>−</button>
                  <span className="w-16 text-center font-extrabold tabular-nums">{budget[k].toFixed(1).replace('.', ',')}</span>
                  <button type="button" className="h-9 w-9 rounded-lg bg-ink text-lg font-bold text-white disabled:opacity-30" disabled={left < BUDGET_STEP - 1e-9} onClick={() => step(k, BUDGET_STEP)} aria-label={`Tăng ${BUDGET_INFO[k].name}`}>+</button>
                </div>
              </div>
              <p className="text-xs text-ink/60">{BUDGET_INFO[k].effect}</p>
              <p className="text-xs text-orange-700">⚠ {BUDGET_INFO[k].trap}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {last && (
            <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setBudget({ ...blankBudget(), ...last.decision.budget })}>
              Như quý trước
            </button>
          )}
          <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setBudget(blankBudget())}>
            Xóa hết
          </button>
        </div>
      </section>

      <ErrorNote text={error} />
      {timeUp ? (
        <p className="card text-center font-bold">⏰ Hết giờ – đang chốt quý…</p>
      ) : (
        <div className="sticky bottom-3 space-y-2">
          <button type="button" className="btn-primary w-full text-lg shadow-lg" disabled={!ready || busy} onClick={submit}>
            {sentAt ? 'Cập nhật quyết định' : 'Nộp quyết định quý'} {!position ? '(chọn định vị)' : room.event && !eventChoice ? '(chọn phản ứng sự kiện)' : left < 0 ? '(vượt ngân sách)' : ''}
          </button>
          <p className="rounded-xl bg-white/90 px-3 py-1.5 text-center text-sm text-ink/70 ring-1 ring-ink/10">
            {sentAt ? '✓ Đã nộp – vẫn sửa được đến khi quý chốt. ' : ''}
            {submittedCount}/{room.order.length} chuỗi đã quyết định
          </p>
        </div>
      )}
    </div>
  );
}

function ReportBlock({ me, room, pid }: { me: MarketMe; room: MarketRoomDoc; pid: string }) {
  const rep = me.reports[me.reports.length - 1];
  const prev = me.reports[me.reports.length - 2];
  if (!rep) return null;
  return (
    <>
      {rep.eventResult && <p className="card text-[15px]">⚡ {rep.eventResult}</p>}
      {(rep.notes.length > 0 || rep.insights.length > 0) && (
        <div className="card space-y-2">
          <h2 className="font-bold">Nhận xét quý {rep.quarter}</h2>
          <ul className="list-disc space-y-1 pl-5 text-[15px] leading-relaxed">
            {rep.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            {rep.insights.map((n) => (
              <li key={n} className="text-emerald-800">{n}</li>
            ))}
          </ul>
          {rep.defaulted && <p className="text-sm text-orange-700">Bạn không nộp quyết định quý này: hệ thống giữ quyết định quý trước.</p>}
        </div>
      )}
      <div className="card">
        <h2 className="mb-2 font-bold">Bảng điều khiển</h2>
        <KpiTable now={rep.kpis} {...(prev ? { prev: prev.kpis } : {})} />
      </div>
      <div className="card">
        <h2 className="mb-2 font-bold">Thị phần theo phân khúc</h2>
        <SegmentTable now={rep.kpis} {...(prev ? { prev: prev.kpis } : {})} />
      </div>
      <div className="card">
        <h2 className="mb-2 font-bold">Mục tiêu ban lãnh đạo 2027</h2>
        <ScorecardBars sc={me.scorecard} kpis={rep.kpis} />
      </div>
      <div className="card">
        <h2 className="mb-2 font-bold">Thị phần theo giá trị qua các quý</h2>
        <ShareChart room={room} me={pid} />
      </div>
    </>
  );
}

function ResultsScreen({ room, session, me, now }: { room: MarketRoomDoc; session: Session; me: MarketMe | null; now: number }) {
  const pid = session.playerId!;
  const st = room.standings[pid];
  const isHost = Boolean(session.hostToken);
  const [busy, setBusy] = useState(false);
  const autoLeft = room.settings.resultsSec > 0 && room.revealedAt ? Math.max(0, Math.ceil((room.revealedAt + room.settings.resultsSec * 1000 - now) / 1000)) : null;
  return (
    <div className="space-y-4">
      <div className="pop rounded-2xl bg-ink px-4 py-3 text-white">
        <p className="text-sm text-white/70">Kết quả quý {room.quarter}/{room.quarters}</p>
        <p className="text-2xl font-extrabold">
          Hạng {st?.rank ?? '–'}/{room.order.length} · giá trị DN {st ? st.valueIndex.toFixed(1).replace('.', ',') : '–'}
        </p>
      </div>
      {room.news.length > 0 && (
        <div className="card space-y-1 text-sm">
          {room.news.map((n) => (
            <p key={n}>📰 {n}</p>
          ))}
        </div>
      )}
      {me ? <ReportBlock me={me} room={room} pid={pid} /> : <p className="card text-center text-ink/60">Đang tải bảng điều khiển…</p>}
      <div className="card">
        <h2 className="mb-2 font-bold">Bảng xếp hạng</h2>
        <Standings room={room} me={pid} />
      </div>
      {isHost ? (
        <button
          type="button"
          className="btn-primary sticky bottom-3 w-full text-lg shadow-lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.advance(room.code, { hostToken: session.hostToken!, expectStatus: 'results', expectQuarter: room.quarter });
            } finally {
              setBusy(false);
            }
          }}
        >
          Sang quý {room.quarter + 1} → {autoLeft !== null ? `(${autoLeft}s)` : ''}
        </button>
      ) : (
        <p className="text-center text-sm text-ink/60">{autoLeft !== null ? `Quý tiếp mở sau ${autoLeft}s…` : `Chờ ${room.hostPlays ? 'chủ phòng' : 'giảng viên'} mở quý tiếp…`}</p>
      )}
    </div>
  );
}

function FinalScreen({ room, session, me }: { room: MarketRoomDoc; session: Session; me: MarketMe | null }) {
  const nav = useNavigate();
  const pid = session.playerId!;
  const st = room.standings[pid];
  const player = room.players[pid];
  const [busy, setBusy] = useState(false);
  const soloHost = Boolean(session.hostToken) && room.order.filter((id) => !room.players[id]?.bot).length === 1;
  const winner = useMemo(() => rankedIds(room)[0], [room]);
  async function again() {
    setBusy(true);
    try {
      const lti = getLti();
      const r = await api.createRoom({ game: 'market-share', hostPlays: true, hostName: player?.name ?? 'Người chơi', settings: room.settings, ...(player?.lms && lti?.role === 'learner' ? { ltiSession: lti.session } : {}) });
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
        <p className="text-5xl">{st?.rank === 1 ? '🏆' : st?.rank === 2 ? '🥈' : st?.rank === 3 ? '🥉' : '📈'}</p>
        <p className="mt-2 text-2xl font-extrabold">
          Hạng {st?.rank ?? '–'}/{room.order.length}
        </p>
        <p className="text-ink/60">
          Giá trị doanh nghiệp {st?.valueIndex.toFixed(1).replace('.', ',')} · lợi nhuận lũy kế {st ? ty(st.profitCum) : '–'} · thị phần {st ? pct(st.share, 1) : '–'}
        </p>
        {winner && winner !== pid && <p className="mt-1 text-sm text-ink/60">Dẫn đầu: {room.players[winner]?.name}</p>}
      </div>
      {player?.lms && (
        <div className={`card text-center text-sm font-medium ${room.lmsStatus?.[pid] === 'error' ? 'text-bad' : 'text-ok'}`}>
          {room.lmsStatus?.[pid] === 'sent'
            ? `✓ Đã gửi điểm ${me?.grade ?? ''}/100 về Sổ điểm Moodle (70% thẻ mục tiêu + 30% thứ hạng; Moodle giữ lần cao nhất).`
            : room.lmsStatus?.[pid] === 'error'
              ? 'Chưa gửi được điểm về Moodle. Báo giảng viên để kiểm tra.'
              : 'Đang gửi điểm về Moodle…'}
        </div>
      )}
      {me && <ReportBlock me={me} room={room} pid={pid} />}
      <div className="card">
        <h2 className="mb-2 font-bold">Bảng xếp hạng chung cuộc</h2>
        <Standings room={room} me={pid} />
      </div>
      {me && <DecisionHistory me={me} />}
      <div className="grid gap-2 sm:grid-cols-2">
        {soloHost && (
          <button type="button" className="btn-primary" disabled={busy} onClick={again}>
            Chơi lại với máy
          </button>
        )}
        <Link to="/" className="btn-ghost">Về trang chủ</Link>
      </div>
    </div>
  );
}

function DecisionHistory({ me }: { me: MarketMe }) {
  if (!me.reports.length) return null;
  return (
    <div className="card overflow-x-auto">
      <h2 className="mb-2 font-bold">Các quyết định của bạn</h2>
      <table className="w-full text-sm">
        <thead className="text-left text-ink/60">
          <tr>
            <th className="py-1 pr-2">Quý</th>
            <th className="py-1 pr-2">Định vị</th>
            <th className="py-1 pr-2">Mục tiêu</th>
            <th className="py-1 pr-2">Chi nhiều nhất</th>
            <th className="py-1 text-right">Lợi nhuận</th>
          </tr>
        </thead>
        <tbody>
          {me.reports.map((r) => {
            const top = (Object.entries(r.decision.budget) as [BudgetKey, number][]).sort((a, b) => b[1] - a[1]).slice(0, 2);
            return (
              <tr key={r.quarter} className="border-t border-ink/10">
                <td className="py-1.5 pr-2">Q{r.quarter}</td>
                <td className="py-1.5 pr-2">{CARD_INFO[r.decision.position].name}</td>
                <td className="py-1.5 pr-2">{r.decision.targets.map((s) => SEGMENT_INFO[s].short).join(', ') || '–'}</td>
                <td className="py-1.5 pr-2">{top.map(([k, v]) => `${BUDGET_INFO[k].name} ${v.toFixed(1).replace('.', ',')}`).join('; ')}</td>
                <td className="py-1.5 text-right tabular-nums">{ty(r.kpis.profit, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
