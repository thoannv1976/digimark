import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ACTIVITY_INFO,
  AP_PER_MONTH,
  CARDS_PER_BID,
  CLUSTERS,
  CLUSTER_INFO,
  FACTORIES,
  FACTORY_IDS,
  INFLUENCE_LABEL,
  LEVEL_LABEL,
  MAX_BIDS,
  MONTHS,
  PRICES,
  PRICE_INFO,
  ROLES,
  ROLE_INFO,
  SPECIAL_INFO,
  THEMES,
  THEME_INFO,
  contractValue,
  planCost,
  type AbmAction,
  type AbmBid,
  type AbmMe,
  type AbmPrice,
  type AbmRoomDoc,
  type AbmSpecialChoice,
  type ActivityKind,
  type ClusterId,
  type FactoryId,
  type RoleId,
  type Theme,
} from '@arena/abm';
import { BOT_LEVEL_LABEL, MAX_SEATS } from '@arena/types';
import { ErrorNote, Qr, joinUrl } from '../components/common';
import { api } from '../lib/api';
import { getLti, setSession, type Session } from '../lib/storage';
import { AbmStandings, AwardCard, Countdown, FactoryFacts, Heatmap, HiddenTable, ScorecardBars, Stars, rankedIds, st, tr, ty, useAbmMe } from './parts';

export function AbmPlay({ room, session, now }: { room: AbmRoomDoc; session: Session; now: number }) {
  const { me, reload } = useAbmMe(room, session.playerId, session.playerToken);
  if (room.status === 'lobby') return <AbmLobby room={room} session={session} />;
  if (room.status === 'decide' && room.round <= MONTHS) return <MonthScreen key={room.round} room={room} session={session} now={now} me={me} reload={reload} />;
  if (room.status === 'decide') return <BidScreen room={room} session={session} now={now} me={me} />;
  if (room.status === 'results') return <ResultsScreen room={room} session={session} me={me} now={now} />;
  return <FinalScreen room={room} session={session} me={me} />;
}

function AbmLobby({ room, session }: { room: AbmRoomDoc; session: Session }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = Boolean(session.hostToken);
  const free = MAX_SEATS - room.order.length;
  return (
    <div className="space-y-4">
      <div className="card text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-ink/50">Game 3 · Săn hợp đồng trọng điểm</p>
        <p className="text-sm text-ink/60">{room.title}</p>
        <p className="mt-1 text-4xl font-extrabold tracking-[0.25em]">{room.code}</p>
        {isHost && room.hostPlays && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <Qr text={joinUrl(room.code)} size={160} />
            <p className="text-sm text-ink/60">Bạn bè quét mã hoặc nhập mã phòng ở trang chủ.</p>
          </div>
        )}
      </div>
      <AbmBriefing />
      <div className="card">
        <h2 className="mb-2 font-bold">Các nhà cung cấp ({room.order.length}/{MAX_SEATS})</h2>
        <ul className="grid gap-1.5">
          {room.order.map((id) => (
            <li key={id} className={`rounded-xl px-3 py-2 ring-1 ${id === session.playerId ? 'bg-amber/20 ring-amber' : 'ring-ink/10'}`}>{room.players[id]!.name}</li>
          ))}
        </ul>
        {room.settings.fillBots && free > 0 && <p className="mt-2 text-sm text-ink/60">Khi bắt đầu, {free} nhà cung cấp còn lại do máy điều hành (mức {BOT_LEVEL_LABEL[room.settings.botLevel]}).</p>}
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
            Bắt đầu
          </button>
        </>
      ) : (
        <p className="card text-center font-medium text-ink/70">⏳ Chờ {room.hostPlays ? 'chủ phòng' : 'giảng viên'} bắt đầu…</p>
      )}
    </div>
  );
}

export function AbmBriefing({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  return (
    <div className="card">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <h2 className="font-bold">📋 Nhiệm vụ của bạn</h2>
        <span className="text-sm text-ink/50">{open ? 'Thu gọn' : 'Xem'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink/80">
          <p>
            Bạn là đội kinh doanh – marketing của một <b>nhà cung cấp hạt nhựa PP trong nước</b> (như Doanh nghiệp C): giao hàng 48 giờ, thanh toán VND, có kỹ sư ứng dụng, nhưng giá cao hơn hàng nhập khẩu 2–4%.
          </p>
          <p>
            6 nhà cung cấp cùng săn <b>8 nhà máy</b> trong sheet “Nhà máy mục tiêu”. Mỗi nhà máy có một <b>nhóm mua 5 vai</b>; mức ảnh hưởng và nỗi đau của từng vai bị giấu.
          </p>
          <p>
            <b>3 tháng tiếp cận</b>, mỗi tháng {AP_PER_MONTH} điểm hành động: phỏng vấn, gặp từng vai với bằng chứng đúng nỗi đau, chạy thử, hội thảo… Muốn gặp giám đốc tài chính hay Tổng giám đốc phải có người giới thiệu (quan hệ từ 2★ với một vai ở đó).
          </p>
          <p>
            Rồi <b>nộp tối đa {MAX_BIDS} hồ sơ</b>: mức giá và 3 thẻ lợi ích. Nhà máy chọn hồ sơ được nhóm mua ủng hộ nhất, nếu nó vượt được nhà cung cấp hiện tại. Hợp đồng thử = 30% nhu cầu trong 12 tháng.
          </p>
          <p>
            <b>Xếp hạng:</b> lãi gộp hợp đồng thắng trừ chi phí tiếp cận. <b>Điểm:</b> 70% thẻ mục tiêu ban lãnh đạo + 30% thứ hạng.
          </p>
        </div>
      )}
    </div>
  );
}

// ───────── Month planning ─────────

const keyOf = (a: AbmAction) =>
  a.kind === 'interview' || a.kind === 'meet' ? `${a.kind}:${a.factory}:${a.role}` : a.factory ? `${a.kind}:${a.factory}` : a.kind === 'seminar' ? `seminar:${a.cluster}` : a.kind;

function describe(a: AbmAction): string {
  const n = ACTIVITY_INFO[a.kind].name;
  switch (a.kind) {
    case 'interview':
      return `Phỏng vấn ${ROLE_INFO[a.role!].short} ${a.factory}`;
    case 'meet':
      return `Gặp ${ROLE_INFO[a.role!].short} ${a.factory} ${THEME_INFO[a.evidence!].icon}`;
    case 'visit':
      return `Tham quan: TGĐ ${a.factory}${a.role ? ` + ${ROLE_INFO[a.role].short}` : ''}`;
    case 'seminar':
      return `Hội thảo ${CLUSTER_INFO[a.cluster!].name}`;
    case 'bulletin':
    case 'linkedin':
      return `${a.kind === 'bulletin' ? 'Bản tin' : 'LinkedIn'}: ${(a.factories ?? []).join(', ')}`;
    case 'fair':
      return 'Hội chợ & brochure';
    default:
      return `${n} · ${a.factory}`;
  }
}

function KnownLine({ me, f, r }: { me: AbmMe; f: FactoryId; r: RoleId }) {
  const k = me.known[f]?.[r];
  if (!k) return <span className="text-xs text-ink/40">Chưa biết gì</span>;
  return (
    <span className="flex flex-wrap gap-1 text-xs">
      {k.influence && <span className={`rounded px-1.5 py-0.5 font-semibold ${k.influence === 3 ? 'bg-ink text-white' : 'bg-ink/10'}`}>Ảnh hưởng {INFLUENCE_LABEL[k.influence].toLowerCase()}</span>}
      {k.pain1 && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900">#1 {THEME_INFO[k.pain1].icon} {THEME_INFO[k.pain1].pain}</span>}
      {k.pain2 && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-900">#2 {THEME_INFO[k.pain2].icon} {THEME_INFO[k.pain2].pain}</span>}
      {k.ai && !k.pain1 && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-900">AI gợi ý: {THEME_INFO[k.ai].icon} {THEME_INFO[k.ai].pain} (chưa kiểm chứng)</span>}
      {k.ai && k.pain1 && k.ai !== k.pain1 && <span className="rounded bg-bad/10 px-1.5 py-0.5 text-bad">AI đoán sai: {THEME_INFO[k.ai].pain}</span>}
    </span>
  );
}

function FactoryPanel({ f, me, room, actions, toggle, add }: { f: FactoryId; me: AbmMe; room: AbmRoomDoc; actions: AbmAction[]; toggle: (a: AbmAction) => void; add: (a: AbmAction) => void }) {
  const [open, setOpen] = useState(false);
  const [meetFor, setMeetFor] = useState<RoleId | null>(null);
  const [companion, setCompanion] = useState<RoleId>('cfo');
  const x = FACTORIES[f];
  const rel = me.rel[f];
  const access = me.access[f];
  const inPlan = actions.filter((a) => a.factory === f || a.factories?.includes(f) || (a.kind === 'seminar' && a.cluster === x.cluster));
  const has = (k: string) => actions.some((a) => keyOf(a) === k);
  const heat = room.heat[f]?.filter((id) => id !== me.playerId).length ?? 0;
  const avg = ROLES.reduce((a, r) => a + rel[r], 0) / ROLES.length;
  const delta = me.reports[me.reports.length - 1]?.delta[f];
  const factoryActs: Array<[ActivityKind, string]> = [
    ['ai', 'AI hồ sơ'],
    ['tco', 'Báo cáo tổng chi phí'],
    ['green', 'Hồ sơ xanh'],
    ['trial', 'Chạy thử'],
  ];
  return (
    <div className={`rounded-2xl bg-white ring-1 ${inPlan.length ? 'ring-2 ring-amber' : 'ring-ink/10'}`}>
      <button type="button" className="w-full px-3 py-2.5 text-left" onClick={() => setOpen(!open)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-extrabold">
              {f} <span className="font-normal text-ink/60">{x.sector}</span>
            </p>
            <FactoryFacts f={f} compact />
          </div>
          <div className="shrink-0 text-right">
            <Stars v={avg} small />
            {heat > 0 && <p className="text-[11px] text-bad">🔥 {heat} đối thủ tháng trước</p>}
            {inPlan.length > 0 && <p className="text-[11px] font-semibold text-amber-700">{inPlan.length} hoạt động</p>}
          </div>
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-ink/10 px-3 pb-3 pt-2">
          <p className="text-sm text-ink/70">📰 {x.news}{x.contacted.length ? ` · Đã liên hệ được: ${x.contacted.map((r) => ROLE_INFO[r].name).join(', ')}` : ' · Chưa có vai nào liên hệ được'}</p>
          <div className="space-y-2">
            {ROLES.map((r) => {
              const meetKey = `meet:${f}:${r}`;
              const meet = actions.find((a) => keyOf(a) === meetKey);
              const known = me.known[f]?.[r];
              const hint = known?.pain1 ?? known?.ai;
              return (
                <div key={r} className={`rounded-xl px-2.5 py-2 ring-1 ${access[r] ? 'ring-ink/10' : 'bg-ink/5 ring-ink/5'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {access[r] ? '' : '🔒 '}
                        {ROLE_INFO[r].name} <span className="text-xs font-normal text-ink/50">{ROLE_INFO[r].kind}</span>
                      </p>
                      <div className="flex items-center gap-2">
                        <Stars v={rel[r]} small />
                        {delta?.[r] ? <span className={`text-[11px] ${delta[r]! > 0 ? 'text-ok' : 'text-bad'}`}>{delta[r]! > 0 ? '+' : ''}{delta[r]!.toFixed(1).replace('.', ',')}</span> : null}
                      </div>
                    </div>
                    {access[r] ? (
                      <div className="flex shrink-0 gap-1">
                        <button type="button" className={`rounded-lg px-2 py-1 text-xs font-semibold ring-1 ${has(`interview:${f}:${r}`) ? 'bg-ink text-white ring-ink' : 'ring-ink/20'}`} onClick={() => toggle({ kind: 'interview', factory: f, role: r })}>
                          Phỏng vấn ·1
                        </button>
                        <button type="button" className={`rounded-lg px-2 py-1 text-xs font-semibold ring-1 ${meet ? 'bg-ink text-white ring-ink' : 'ring-ink/20'}`} onClick={() => (meet ? toggle(meet) : setMeetFor(meetFor === r ? null : r))}>
                          {meet ? `Gặp ${THEME_INFO[meet.evidence!].icon} ✕` : 'Gặp ·2'}
                        </button>
                      </div>
                    ) : (
                      <span className="shrink-0 text-[11px] text-ink/50">Cần quan hệ {r === 'cfo' || r === 'ceo' ? '2' : '1'}★ với một vai</span>
                    )}
                  </div>
                  <div className="mt-1">
                    <KnownLine me={me} f={f} r={r} />
                  </div>
                  {meetFor === r && !meet && (
                    <div className="mt-2 grid gap-1">
                      <p className="text-xs font-semibold text-ink/60">Mang theo bằng chứng nào?</p>
                      {THEMES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`rounded-lg px-2 py-1.5 text-left text-xs ring-1 hover:bg-amber/15 ${hint === t ? 'bg-emerald-50 ring-emerald-300' : 'ring-ink/15'}`}
                          onClick={() => {
                            add({ kind: 'meet', factory: f, role: r, evidence: t });
                            setMeetFor(null);
                          }}
                        >
                          {THEME_INFO[t].icon} {THEME_INFO[t].evidence}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {factoryActs.map(([kind, label]) => (
              <button key={kind} type="button" className={`rounded-lg px-2 py-2 text-left text-xs ring-1 ${has(`${kind}:${f}`) ? 'bg-ink text-white ring-ink' : 'ring-ink/20 hover:bg-amber/10'}`} onClick={() => toggle({ kind, factory: f })} title={ACTIVITY_INFO[kind].effect}>
                <b>{label}</b> · {ACTIVITY_INFO[kind].ap} điểm · {tr(ACTIVITY_INFO[kind].cost)}
              </button>
            ))}
            <div className={`col-span-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ring-1 ${has(`visit:${f}`) ? 'bg-ink text-white ring-ink' : 'ring-ink/20'}`}>
              <button type="button" className="flex-1 text-left" onClick={() => toggle({ kind: 'visit', factory: f, role: companion })}>
                <b>Mời tham quan nhà máy</b> · 2 điểm · 50 triệu: TGĐ +
              </button>
              <select className="rounded bg-white px-1 py-0.5 text-ink ring-1 ring-ink/20" value={companion} onChange={(e) => setCompanion(e.target.value as RoleId)} aria-label="Vai đi cùng">
                {ROLES.filter((r) => r !== 'ceo').map((r) => (
                  <option key={r} value={r}>{ROLE_INFO[r].short}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-ink/50">🔒 Vai chưa mở: hoạt động nhóm (báo cáo, hồ sơ xanh, tham quan…) vẫn tới được nhưng chỉ hiệu quả một nửa.</p>
        </div>
      )}
    </div>
  );
}

function PickFactories({ max, value, onChange }: { max: number; value: FactoryId[]; onChange: (v: FactoryId[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {FACTORY_IDS.map((f) => {
        const on = value.includes(f);
        return (
          <button key={f} type="button" className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${on ? 'bg-ink text-white ring-ink' : 'ring-ink/20'}`} onClick={() => onChange(on ? value.filter((x) => x !== f) : value.length >= max ? [...value.slice(1), f] : [...value, f])}>
            {f}
          </button>
        );
      })}
    </div>
  );
}

function MonthScreen({ room, session, now, me, reload }: { room: AbmRoomDoc; session: Session; now: number; me: AbmMe | null; reload: () => void }) {
  const pid = session.playerId!;
  const [actions, setActions] = useState<AbmAction[]>([]);
  const [special, setSpecial] = useState<AbmSpecialChoice | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [bulletin, setBulletin] = useState<FactoryId[]>([]);
  const [linked, setLinked] = useState<FactoryId[]>([]);

  useEffect(() => {
    if (loaded || !me) return;
    if (me.pending) {
      setActions(me.pending.actions);
      if (me.pending.special) setSpecial(me.pending.special);
      setSentAt(Date.now());
      const b = me.pending.actions.find((a) => a.kind === 'bulletin');
      const l = me.pending.actions.find((a) => a.kind === 'linkedin');
      if (b?.factories) setBulletin(b.factories);
      if (l?.factories) setLinked(l.factories);
    }
    setLoaded(true);
  }, [me, loaded]);

  const { ap, cost } = planCost({ actions });
  const left = AP_PER_MONTH - ap;
  const submittedCount = room.order.filter((id) => room.players[id]?.bot || room.submitted[id]).length;
  const timeUp = room.deadline !== null && now > room.deadline;
  const ready = left >= 0 && (!me?.special || special);

  const [notice, setNotice] = useState<string | null>(null);
  const tooMuch = (next: AbmAction[], a: AbmAction) => {
    if (planCost({ actions: next }).ap <= AP_PER_MONTH) return false;
    setNotice(`Không đủ điểm hành động cho “${ACTIVITY_INFO[a.kind].name}” (${ACTIVITY_INFO[a.kind].ap} điểm). Bỏ bớt hoạt động khác trước.`);
    return true;
  };
  const toggle = (a: AbmAction) => {
    const k = keyOf(a);
    setNotice(null);
    if (actions.some((x) => keyOf(x) === k)) setActions(actions.filter((x) => keyOf(x) !== k));
    else if (!tooMuch([...actions, a], a)) setActions([...actions, a]);
  };
  const add = (a: AbmAction) => {
    setNotice(null);
    const rest = actions.filter((x) => keyOf(x) !== keyOf(a));
    if (!tooMuch([...rest, a], a)) setActions([...rest, a]);
  };
  const has = (k: string) => actions.some((a) => keyOf(a) === k);

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api.plan(room.code, pid, session.playerToken!, room.round, { actions, ...(special ? { special } : {}) });
      setSentAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không nộp được.');
      reload();
    } finally {
      setBusy(false);
    }
  }

  if (!me) return <p className="card text-center text-ink/60">Đang tải hồ sơ 8 nhà máy…</p>;
  return (
    <div className="space-y-4 pb-28">
      <div className="flex items-center justify-between">
        <span className="text-lg font-extrabold">Tháng {room.round}/{MONTHS}</span>
        <Countdown deadline={room.deadline} now={now} />
      </div>
      {room.round === 1 && <AbmBriefing compact />}
      {room.event && (
        <section className="card space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink/50">Sự kiện tháng {room.round}</p>
          <h2 className="text-lg font-extrabold">{room.event.title}</h2>
          <p className="text-[15px] leading-relaxed text-ink/80">{room.event.text}</p>
        </section>
      )}
      {me.special && (
        <section className="card space-y-2 ring-2 ring-bad">
          <h2 className="text-lg font-extrabold text-bad">📩 {me.special.title}</h2>
          <p className="text-[15px] leading-relaxed">{me.special.text}</p>
          <div className="grid gap-1.5">
            {(Object.keys(SPECIAL_INFO) as AbmSpecialChoice[]).map((c) => (
              <button key={c} type="button" onClick={() => setSpecial(c)} className={`rounded-xl px-3 py-2 text-left text-sm ring-1 ${special === c ? 'bg-ink text-white ring-ink' : 'ring-ink/15 hover:bg-amber/15'}`}>
                {SPECIAL_INFO[c]} <span className="opacity-70">(miễn phí)</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {room.round > 1 && (
        <section className="card">
          <h2 className="mb-2 font-bold">Tháng trước ai theo nhà máy nào</h2>
          <Heatmap room={room} me={pid} />
        </section>
      )}
      <section className="space-y-2">
        <h2 className="font-bold">8 nhà máy · chạm để xem nhóm mua</h2>
        {FACTORY_IDS.map((f) => (
          <FactoryPanel key={f} f={f} me={me} room={room} actions={actions} toggle={toggle} add={add} />
        ))}
      </section>
      <section className="card space-y-3">
        <h2 className="font-bold">Theo ngành (1:vài) và đại trà (1:nhiều)</h2>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-ink/60">{LEVEL_LABEL['1:few']} · {ACTIVITY_INFO.seminar.name} · 3 điểm · 80 triệu</p>
          <div className="grid gap-1.5">
            {CLUSTERS.map((c: ClusterId) => (
              <button key={c} type="button" className={`rounded-lg px-2 py-2 text-left text-sm ring-1 ${has(`seminar:${c}`) ? 'bg-ink text-white ring-ink' : 'ring-ink/20'}`} onClick={() => toggle({ kind: 'seminar', cluster: c })}>
                {CLUSTER_INFO[c].seminar} <span className="opacity-60">({FACTORY_IDS.filter((f) => FACTORIES[f].cluster === c).join(', ')})</span>
              </button>
            ))}
          </div>
        </div>
        <div className={`space-y-1.5 rounded-xl p-2 ring-1 ${has('bulletin') ? 'ring-2 ring-ink' : 'ring-ink/10'}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm"><b>{ACTIVITY_INFO.bulletin.name}</b> · 1 điểm · 10 triệu · tối đa 4 nhà máy</p>
            <button type="button" className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${has('bulletin') ? 'bg-ink text-white' : 'bg-ink/10'}`} disabled={!bulletin.length} onClick={() => (has('bulletin') ? toggle({ kind: 'bulletin' }) : add({ kind: 'bulletin', factories: bulletin }))}>
              {has('bulletin') ? 'Bỏ' : 'Thêm'}
            </button>
          </div>
          <PickFactories max={4} value={bulletin} onChange={(v) => { setBulletin(v); if (has('bulletin')) add({ kind: 'bulletin', factories: v }); }} />
        </div>
        <div className={`space-y-1.5 rounded-xl p-2 ring-1 ${has('linkedin') ? 'ring-2 ring-ink' : 'ring-ink/10'}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm"><b>{ACTIVITY_INFO.linkedin.name}</b> · 1 điểm · 40 triệu · tối đa 3 nhà máy</p>
            <button type="button" className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${has('linkedin') ? 'bg-ink text-white' : 'bg-ink/10'}`} disabled={!linked.length} onClick={() => (has('linkedin') ? toggle({ kind: 'linkedin' }) : add({ kind: 'linkedin', factories: linked }))}>
              {has('linkedin') ? 'Bỏ' : 'Thêm'}
            </button>
          </div>
          <PickFactories max={3} value={linked} onChange={(v) => { setLinked(v); if (has('linkedin')) add({ kind: 'linkedin', factories: v }); }} />
        </div>
        <button type="button" className={`w-full rounded-lg px-2 py-2 text-left text-sm ring-1 ${has('fair') ? 'bg-ink text-white ring-ink' : 'ring-ink/20'}`} onClick={() => toggle({ kind: 'fair' })}>
          <b>{ACTIVITY_INFO.fair.name}</b> · 2 điểm · 150 triệu – {ACTIVITY_INFO.fair.effect}
        </button>
      </section>

      <ErrorNote text={error} />
      {timeUp ? (
        <p className="card text-center font-bold">⏰ Hết giờ – đang chốt tháng…</p>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink/10 bg-white/95 px-4 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto max-w-xl space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className={`rounded-full px-2.5 py-0.5 font-bold ${left < 0 ? 'bg-bad/15 text-bad' : left === 0 ? 'bg-ok/15 text-ok' : 'bg-amber/25'}`}>⚡ {ap}/{AP_PER_MONTH} điểm</span>
              <span className="text-ink/70">Chi {tr(cost)} · đã chi {tr(me.costCum)}</span>
              <span className="text-ink/60">{submittedCount}/{room.order.length} đã nộp</span>
            </div>
            {notice && <p className="rounded-lg bg-bad/10 px-2 py-1 text-xs font-medium text-bad">{notice}</p>}
            {actions.length > 0 && (
              <div className="flex max-h-16 flex-wrap gap-1 overflow-y-auto">
                {actions.map((a) => (
                  <button key={keyOf(a)} type="button" className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px]" onClick={() => toggle(a)}>
                    {describe(a)} ✕
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="btn-primary w-full" disabled={!ready || busy} onClick={submit}>
              {sentAt ? '✓ Đã nộp · cập nhật kế hoạch' : 'Nộp kế hoạch tháng'} {me.special && !special ? '(trả lời tin nhắn)' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── Results of a month ─────────

function ReportBlock({ me }: { me: AbmMe }) {
  const rep = me.reports[me.reports.length - 1];
  if (!rep) return null;
  const rows = FACTORY_IDS.filter((f) => rep.delta[f]);
  return (
    <>
      <div className="card space-y-2">
        <h2 className="font-bold">Kết quả tháng {rep.round} · {rep.apUsed} điểm · {tr(rep.cost)}</h2>
        <ul className="list-disc space-y-1 pl-5 text-[15px] leading-relaxed">
          {rep.lines.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
      {rep.quotes.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-bold">🗣 Họ nói gì</h2>
          {rep.quotes.map((q, i) => (
            <div key={i} className="rounded-xl bg-emerald-50 px-3 py-2 text-sm">
              <p className="text-xs font-semibold text-emerald-800">{ROLE_INFO[q.role].name} · {q.factory}</p>
              <p className="italic">“{q.text}”</p>
            </div>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="mb-2 font-bold">Quan hệ thay đổi</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-ink/60">
              <tr>
                <th className="py-1 pr-2">Nhà máy</th>
                {ROLES.map((r) => (
                  <th key={r} className="py-1 pr-2 text-right">{ROLE_INFO[r].short}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f} className="border-t border-ink/10">
                  <td className="py-1.5 pr-2 font-semibold">{f}</td>
                  {ROLES.map((r) => {
                    const d = rep.delta[f]?.[r];
                    return (
                      <td key={r} className="py-1.5 pr-2 text-right tabular-nums">
                        {st(me.rel[f][r])}
                        {d ? <span className={`ml-0.5 text-[11px] ${d > 0 ? 'text-ok' : 'text-bad'}`}>{d > 0 ? '+' : ''}{d.toFixed(1).replace('.', ',')}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ResultsScreen({ room, session, me, now }: { room: AbmRoomDoc; session: Session; me: AbmMe | null; now: number }) {
  const pid = session.playerId!;
  const isHost = Boolean(session.hostToken);
  const [busy, setBusy] = useState(false);
  const autoLeft = room.settings.resultsSec > 0 && room.revealedAt ? Math.max(0, Math.ceil((room.revealedAt + room.settings.resultsSec * 1000 - now) / 1000)) : null;
  const next = room.round >= MONTHS ? 'Sang vòng nộp hồ sơ' : `Sang tháng ${room.round + 1}`;
  return (
    <div className="space-y-4">
      <div className="pop rounded-2xl bg-ink px-4 py-3 text-white">
        <p className="text-sm text-white/70">Hết tháng {room.round}/{MONTHS}</p>
        <p className="text-2xl font-extrabold">Đã chi {me ? tr(me.costCum) : '…'} · {me?.scorecard.reachedFactories ?? 0} nhà máy có ≥ 3 vai từ 2★</p>
      </div>
      {room.news.length > 0 && (
        <div className="card space-y-1 text-sm">
          {room.news.map((n) => (
            <p key={n}>📰 {n}</p>
          ))}
        </div>
      )}
      {me ? <ReportBlock me={me} /> : <p className="card text-center text-ink/60">Đang tải kết quả…</p>}
      <div className="card">
        <h2 className="mb-2 font-bold">Tháng này ai theo nhà máy nào</h2>
        <Heatmap room={room} me={pid} />
      </div>
      {isHost ? (
        <button
          type="button"
          className="btn-primary sticky bottom-3 w-full text-lg shadow-lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.advance(room.code, { hostToken: session.hostToken!, expectStatus: 'results', expectQuarter: room.round });
            } finally {
              setBusy(false);
            }
          }}
        >
          {next} → {autoLeft !== null ? `(${autoLeft}s)` : ''}
        </button>
      ) : (
        <p className="text-center text-sm text-ink/60">{autoLeft !== null ? `${next} sau ${autoLeft}s…` : `Chờ ${room.hostPlays ? 'chủ phòng' : 'giảng viên'} mở vòng tiếp…`}</p>
      )}
    </div>
  );
}

// ───────── Bids ─────────

function BidScreen({ room, session, now, me }: { room: AbmRoomDoc; session: Session; now: number; me: AbmMe | null }) {
  const pid = session.playerId!;
  const [bids, setBids] = useState<AbmBid[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  useEffect(() => {
    if (loaded || !me) return;
    if (me.bids) {
      setBids(me.bids);
      setSentAt(Date.now());
    }
    setLoaded(true);
  }, [me, loaded]);
  const submittedCount = room.order.filter((id) => room.players[id]?.bot || room.submitted[id]).length;
  const timeUp = room.deadline !== null && now > room.deadline;
  const ready = bids.every((b) => b.cards.length === CARDS_PER_BID);
  const order = useMemo(() => {
    if (!me) return FACTORY_IDS.slice();
    return FACTORY_IDS.slice().sort((a, b) => ROLES.reduce((s, r) => s + me.rel[b][r], 0) - ROLES.reduce((s, r) => s + me.rel[a][r], 0));
  }, [me]);
  const set = (f: FactoryId, fn: (b: AbmBid) => AbmBid) => setBids((xs) => xs.map((b) => (b.factory === f ? fn(b) : b)));
  const toggle = (f: FactoryId) =>
    setBids((xs) => (xs.some((b) => b.factory === f) ? xs.filter((b) => b.factory !== f) : xs.length >= MAX_BIDS ? xs : [...xs, { factory: f, price: me?.priceCap[f] ?? 'p3', cards: [] }]));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.bids(room.code, pid, session.playerToken!, room.round, bids);
      setSentAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không nộp được.');
    } finally {
      setBusy(false);
    }
  }
  if (!me) return <p className="card text-center text-ink/60">Đang tải…</p>;
  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <span className="text-lg font-extrabold">Nộp hồ sơ chào hàng</span>
        <Countdown deadline={room.deadline} now={now} />
      </div>
      <p className="card text-[15px] leading-relaxed text-ink/80">
        Chọn tối đa <b>{MAX_BIDS} nhà máy</b>. Mỗi hồ sơ: <b>mức giá</b> so với hàng nhập khẩu và <b>đúng {CARDS_PER_BID} thẻ lợi ích</b>. Nhà máy cộng điểm từng vai: quan hệ (60%) và thẻ khớp nỗi đau của vai đó (40%), nhân mức ảnh hưởng; giá cao bị trừ điểm, nặng nhất ở phòng mua hàng và tài chính. Hồ sơ phải vượt nhà cung cấp hiện tại.
      </p>
      <div className="space-y-2">
        {order.map((f) => {
          const bid = bids.find((b) => b.factory === f);
          const cap = me.priceCap[f];
          const known = ROLES.map((r) => ({ r, k: me.known[f]?.[r] })).filter((x) => x.k?.pain1 || x.k?.ai);
          return (
            <div key={f} className={`rounded-2xl bg-white p-3 ring-1 ${bid ? 'ring-2 ring-amber' : 'ring-ink/10'}`}>
              <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => toggle(f)}>
                <div>
                  <p className="font-extrabold">{bid ? '✅ ' : ''}{f} <span className="font-normal text-ink/60">{FACTORIES[f].sector}</span></p>
                  <FactoryFacts f={f} compact />
                </div>
                <div className="shrink-0 text-right text-xs">
                  {ROLES.map((r) => (
                    <div key={r} className="flex items-center justify-end gap-1">
                      <span className="text-ink/50">{ROLE_INFO[r].short}</span>
                      <Stars v={me.rel[f][r]} small />
                    </div>
                  ))}
                </div>
              </button>
              {bid && (
                <div className="mt-2 space-y-2 border-t border-ink/10 pt-2">
                  {known.length > 0 && (
                    <p className="text-xs text-ink/70">
                      Bạn biết: {known.map(({ r, k }) => `${ROLE_INFO[r].short} ${k!.influence ? `(${INFLUENCE_LABEL[k!.influence].toLowerCase()})` : ''} ${THEME_INFO[(k!.pain1 ?? k!.ai)!].icon}${k!.pain1 ? '' : '?'}`).join(' · ')}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRICES.map((p: AbmPrice) => {
                      const blocked = cap && PRICES.indexOf(p) < PRICES.indexOf(cap);
                      const v = contractValue(f, p);
                      return (
                        <button key={p} type="button" disabled={Boolean(blocked)} onClick={() => set(f, (b) => ({ ...b, price: p }))} className={`rounded-lg px-2 py-1.5 text-left text-xs ring-1 disabled:opacity-30 ${bid.price === p ? 'bg-ink text-white ring-ink' : 'ring-ink/20'}`}>
                          <b>{PRICE_INFO[p].short}</b> · lãi gộp {(PRICE_INFO[p].margin * 100).toFixed(1).replace('.', ',')}% · {ty(v.gp, 1)}
                        </button>
                      );
                    })}
                  </div>
                  {cap && <p className="text-xs text-orange-700">Bạn đã hứa giảm 3% ở {f}: không chào cao hơn giá nhập khẩu được.</p>}
                  <div className="grid gap-1">
                    <p className="text-xs font-semibold text-ink/60">Thẻ lợi ích ({bid.cards.length}/{CARDS_PER_BID})</p>
                    {THEMES.map((t: Theme) => {
                      const on = bid.cards.includes(t);
                      return (
                        <button key={t} type="button" onClick={() => set(f, (b) => ({ ...b, cards: on ? b.cards.filter((x) => x !== t) : b.cards.length >= CARDS_PER_BID ? [...b.cards.slice(1), t] : [...b.cards, t] }))} className={`rounded-lg px-2 py-1.5 text-left text-xs ring-1 ${on ? 'bg-amber/30 ring-amber' : 'ring-ink/15'}`}>
                          {THEME_INFO[t].icon} {THEME_INFO[t].benefit}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ErrorNote text={error} />
      {timeUp ? (
        <p className="card text-center font-bold">⏰ Hết giờ – đang trao hợp đồng…</p>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink/10 bg-white/95 px-4 py-2 backdrop-blur">
          <div className="mx-auto max-w-xl space-y-1">
            <p className="text-center text-sm text-ink/70">{bids.length}/{MAX_BIDS} hồ sơ · {submittedCount}/{room.order.length} đã nộp{sentAt ? ' · ✓ đã nộp, vẫn sửa được' : ''}</p>
            <button type="button" className="btn-primary w-full" disabled={!ready || busy} onClick={submit}>
              {bids.length === 0 ? 'Không nộp hồ sơ nào' : sentAt ? 'Cập nhật hồ sơ' : `Nộp ${bids.length} hồ sơ`} {!ready ? '(mỗi hồ sơ cần 3 thẻ)' : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── Final ─────────

function FinalScreen({ room, session, me }: { room: AbmRoomDoc; session: Session; me: AbmMe | null }) {
  const nav = useNavigate();
  const pid = session.playerId!;
  const s = room.standings[pid];
  const player = room.players[pid];
  const [busy, setBusy] = useState(false);
  const soloHost = Boolean(session.hostToken) && room.order.filter((id) => !room.players[id]?.bot).length === 1;
  const winner = rankedIds(room)[0];
  async function again() {
    setBusy(true);
    try {
      const lti = getLti();
      const r = await api.createRoom({ game: 'key-accounts', hostPlays: true, hostName: player?.name ?? 'Người chơi', settings: room.settings, ...(player?.lms && lti?.role === 'learner' ? { ltiSession: lti.session } : {}) });
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
        <p className="text-5xl">{s?.rank === 1 ? '🏆' : s?.rank === 2 ? '🥈' : s?.rank === 3 ? '🥉' : '🤝'}</p>
        <p className="mt-2 text-2xl font-extrabold">Hạng {s?.rank ?? '–'}/{room.order.length}</p>
        <p className="text-ink/60">
          {s?.contracts ?? 0} hợp đồng / {s?.bids ?? 0} hồ sơ · lãi gộp {s ? ty(s.gp) : '–'} · chi {s ? ty(s.cost) : '–'} · <b>lãi ròng {s ? ty(s.net) : '–'}</b>
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
      {me && (
        <div className="card">
          <h2 className="mb-2 font-bold">Mục tiêu ban lãnh đạo</h2>
          <ScorecardBars sc={me.scorecard} />
        </div>
      )}
      <div className="space-y-2">
        <h2 className="font-bold">Trao hợp đồng 8 nhà máy</h2>
        {(room.awards ?? []).map((a) => (
          <AwardCard key={a.factory} room={room} a={a} me={pid} />
        ))}
      </div>
      <div className="card">
        <h2 className="mb-2 font-bold">Bảng xếp hạng chung cuộc</h2>
        <AbmStandings room={room} me={pid} />
      </div>
      {room.hidden ? (
        <div className="card">
          <h2 className="mb-1 font-bold">🔓 Phần ẩn của 8 nhóm mua</h2>
          <p className="mb-2 text-xs text-ink/60">Mức ảnh hưởng, 2 nỗi đau lớn nhất của từng vai (cuối tháng 3) và ngưỡng của nhà cung cấp hiện tại.</p>
          <HiddenTable room={room} />
        </div>
      ) : (
        <p className="text-center text-sm text-ink/50">Giảng viên sẽ lật phần ẩn (mức ảnh hưởng, nỗi đau từng vai) khi tổng kết.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {soloHost && (
          <button type="button" className="btn-primary" disabled={busy} onClick={again}>
            Chơi lại với máy
          </button>
        )}
        {soloHost && !room.hidden && (
          <button type="button" className="btn-ghost" onClick={() => void api.reveal(room.code, session.hostToken!)}>
            🔓 Lật phần ẩn
          </button>
        )}
        <Link to="/" className="btn-ghost">Về trang chủ</Link>
      </div>
    </div>
  );
}
