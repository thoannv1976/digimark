// Game 4 "Tín hiệu sớm" – màn hình người chơi. Chỉ dùng phần công khai của engine (@arena/sg).
import { useState } from 'react';
import {
  SG_ACTIONS,
  SG_ACTION_INFO,
  SG_AI_EXTRA,
  SG_ARCHETYPE_INFO,
  SG_BADGES,
  SG_BLIND_LOSS,
  SG_CROWD,
  SG_DEBRIEF,
  SG_FIT,
  SG_FRAME_INFO,
  SG_GROUPS,
  SG_GROUP_INFO,
  SG_HOURS,
  SG_MAX_EVIDENCE,
  SG_PROFIT_TARGET,
  SG_QUALITY_INFO,
  SG_QUARTER_INFO,
  SG_QUESTIONS,
  SG_QUESTION_INFO,
  SG_RESTRICTED_FINE,
  SG_ROUNDS,
  SG_SCORE_MAX,
  SG_SCORE_PARTS,
  SG_SHIFTS,
  SG_SHIFT_INFO,
  SG_SOURCE,
  SG_VERIFY_COST,
  SG_WHEN_MUL,
  type SgAction,
  type SgDecision,
  type SgPub,
  type SgReport,
  type SgShift,
  type SgSignal,
  type SgView,
} from '@arena/sg';
import type { RsMe, RsRoomDoc } from '@arena/rs';
import { Bar, Budget, Choice, Kv, bnv, fmtNum, type RsWeb } from '../rs/parts';

type Me = RsMe<SgReport, SgView> | null;

/** Giờ phân tích mà kế hoạch đang dùng (giống hệt phép tính ở máy chủ). */
export function sgSpentOf(d: SgDecision): number {
  return d.sensors.reduce((a, g) => a + SG_GROUP_INFO[g].cost, 0) + d.verify.length * SG_VERIFY_COST + SG_ACTION_INFO[d.action].cost + SG_FRAME_INFO[d.frame].cost;
}

function Briefing({ compact }: { compact?: boolean }) {
  return (
    <div className="card space-y-2 text-[15px] leading-relaxed">
      <h2 className="font-bold">📡 Bạn là bộ phận thông tin thị trường</h2>
      <p>
        Sáu đơn vị cùng theo dõi một thị trường: nhiên liệu công nghiệp cho các khu công nghiệp. Thị trường đang chuyển dịch, nhưng
        <b> không phải chuyển dịch nào cũng có thật</b>. Mỗi quý bạn có <b>{SG_HOURS} giờ phân tích</b> để chia cho ba việc: theo dõi, kiểm chứng và hành động.
      </p>
      {!compact && (
        <>
          <p>Phiếu quyết định đi đúng sáu bước Market Intelligence của giáo trình: câu hỏi kinh doanh → nguồn dữ liệu → thu thập và kiểm chứng → phân tích → đề xuất quyết định → theo dõi kết quả.</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink/80">
            <li>Nhóm thông tin vừa bật thì <b>quý sau mới có dữ liệu</b>.</li>
            <li>Kiểm chứng tốn {SG_VERIFY_COST} giờ cho mỗi tín hiệu, và kết quả <b>dùng được từ quý sau</b>.</li>
            <li>Quyết định không có bằng chứng đã kiểm chứng chỉ được lãnh đạo duyệt một phần.</li>
            <li>Hành động đúng một quý trước khi chuyển dịch ăn tiền được ăn gấp rưỡi; đi quá sớm thì thị trường chưa có ở đó.</li>
          </ul>
        </>
      )}
      <p className="text-sm text-ink/60">Thẻ mục tiêu: lợi nhuận cộng dồn {SG_SCORE_MAX.profit} + chỉ số tín hiệu sớm {SG_SCORE_MAX.early} + kỷ luật thông tin {SG_SCORE_MAX.discipline}.</p>
    </div>
  );
}

function QualityTag({ q }: { q: SgSignal['quality'] }) {
  if (!q) return <span className="rounded bg-ink/10 px-1.5 py-0.5 text-[11px] text-ink/60">chưa kiểm chứng</span>;
  const info = SG_QUALITY_INFO[q];
  const tone = q === 'solid' ? 'bg-ok/15 text-ok' : q === 'false' || q === 'restricted' ? 'bg-bad/15 text-bad' : 'bg-amber/25';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`} title={`${info.dim}: ${info.note}`}>
      {info.icon} {info.name}
    </span>
  );
}

function SignalRow({ s, d, set, round }: { s: SgSignal; d: SgDecision; set: (d: SgDecision) => void; round: number }) {
  const checking = d.verify.includes(s.id);
  const cited = d.evidence.includes(s.id);
  const known = Boolean(s.quality);
  return (
    <li className={`rounded-xl px-3 py-2 ring-1 ${cited ? 'bg-amber/15 ring-amber' : 'bg-white ring-ink/10'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-ink/50">
            {SG_GROUP_INFO[s.group].icon} {s.source} · quý {s.round}
            {s.ai && <span className="ml-1 rounded bg-violet-100 px-1 font-semibold text-violet-800">AI</span>}
          </p>
          <p className="text-sm leading-snug">{s.text}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <QualityTag q={s.quality} />
            {s.shift && <span className="text-[11px] text-ink/60">{SG_SHIFT_INFO[s.shift].icon} {SG_SHIFT_INFO[s.shift].name}</span>}
            {s.quality && !s.shift && <span className="text-[11px] text-ink/60">không nói về chuyển dịch nào</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {!known && s.round === round && (
            <button
              type="button"
              className={`rounded-lg px-2 py-1 text-xs font-semibold ring-1 ${checking ? 'bg-ink text-white ring-ink' : 'bg-white ring-ink/20'}`}
              onClick={() => set({ ...d, verify: checking ? d.verify.filter((x) => x !== s.id) : [...d.verify, s.id] })}
            >
              {checking ? '✓ kiểm chứng' : `Kiểm chứng (${SG_VERIFY_COST}h)`}
            </button>
          )}
          <button
            type="button"
            className={`rounded-lg px-2 py-1 text-xs font-semibold ring-1 ${cited ? 'bg-amber ring-amber' : 'bg-white ring-ink/20'}`}
            disabled={!cited && d.evidence.length >= SG_MAX_EVIDENCE}
            onClick={() => set({ ...d, evidence: cited ? d.evidence.filter((x) => x !== s.id) : [...d.evidence, s.id] })}
          >
            {cited ? '✓ bằng chứng' : 'Làm bằng chứng'}
          </button>
        </div>
      </div>
    </li>
  );
}

function Form({ room, me, d, set, round }: { room: RsRoomDoc; me: Me; d: SgDecision; set: (d: SgDecision) => void; round: number }) {
  const [openLib, setOpenLib] = useState(false);
  const view = me?.view;
  const pub = (room.pub ?? {}) as unknown as SgPub;
  const spent = sgSpentOf(d);
  const left = SG_HOURS - spent;
  const signals = view?.signals ?? [];
  const library = (view?.known ?? []).filter((s) => s.round < round);
  const fitOf = (shift: SgShift) => {
    const i = SG_FIT[shift].indexOf(d.action);
    return i === 0 ? 'đúng nhất' : i === 1 ? 'phù hợp' : 'không liên quan';
  };
  return (
    <div className="space-y-3">
      <div className="card">
        <Budget spent={spent} total={SG_HOURS} unit="Giờ phân tích đã dùng" />
        <Kv
          rows={[
            ['Lợi nhuận cộng dồn', bnv(view?.profitCum ?? 0), (view?.profitCum ?? 0) < 0],
            ['Mục tiêu cả trận', bnv(SG_PROFIT_TARGET)],
            ['Cảm biến đang chạy', (view?.sensors ?? []).length ? (view?.sensors ?? []).map((g) => SG_GROUP_INFO[g].icon).join(' ') : 'chưa có'],
          ]}
        />
      </div>

      <div className="card space-y-2">
        <h3 className="font-bold">Bước 1 · Câu hỏi kinh doanh của quý</h3>
        <Choice options={SG_QUESTIONS} value={d.question} onChange={(q) => set({ ...d, question: q })} label={(q) => SG_QUESTION_INFO[q].name} note={(q) => `ưu tiên: ${SG_QUESTION_INFO[q].focus.map((g) => SG_GROUP_INFO[g].name).join(', ')}`} cols={1} />
      </div>

      <div className="card space-y-2">
        <h3 className="font-bold">Bước 2 · Nguồn dữ liệu</h3>
        <p className="text-sm text-ink/60">Bật cảm biến ở nhóm nào thì quý sau thấy tín hiệu của nhóm đó. Nhóm đang bật vẫn tốn phí duy trì mỗi quý.</p>
        <div className="grid gap-1.5">
          {SG_GROUPS.map((g) => {
            const on = d.sensors.includes(g);
            const info = SG_GROUP_INFO[g];
            const isNew = on && !(view?.sensors ?? []).includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => set({ ...d, sensors: on ? d.sensors.filter((x) => x !== g) : [...d.sensors, g] })}
                className={`rounded-xl px-3 py-2 text-left text-sm ring-1 ${on ? 'bg-ink text-white ring-ink' : 'bg-white ring-ink/15'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {info.icon} {info.name}
                  </span>
                  <span className="shrink-0 text-xs">{info.cost} giờ/quý</span>
                </span>
                <span className={`block text-xs ${on ? 'text-white/70' : 'text-ink/50'}`}>{info.question}</span>
                <span className={`block text-[11px] ${on ? 'text-amber' : 'text-ink/40'}`}>
                  {isNew ? 'vừa bật – có dữ liệu từ quý sau · ' : ''}
                  {pub.watchers?.[g] ? `${pub.watchers[g]} đơn vị đang theo dõi nhóm này` : 'chưa đơn vị nào theo dõi nhóm này'}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => set({ ...d, aiDigest: !d.aiDigest })}
          className={`w-full rounded-xl px-3 py-2 text-left text-sm ring-1 ${d.aiDigest ? 'bg-violet-700 text-white ring-violet-700' : 'bg-white ring-ink/15'}`}
        >
          <span className="font-semibold">🤖 Để AI tổng hợp thêm (miễn phí, +{SG_AI_EXTRA} tín hiệu từ quý sau)</span>
          <span className={`block text-xs ${d.aiDigest ? 'text-white/75' : 'text-ink/50'}`}>Nhanh và không mất giờ. Khoảng một phần ba bản tổng hợp của AI có một số liệu bịa, và hành động trên bản AI chưa kiểm chứng bị trừ gấp đôi.</span>
        </button>
      </div>

      <div className="card space-y-2">
        <h3 className="font-bold">Bước 3 · Tín hiệu quý {round}</h3>
        {signals.length === 0 ? (
          <p className="rounded-xl bg-ink/5 p-3 text-sm text-ink/70">
            Chưa có tín hiệu nào. {round === 1 ? 'Quý 1 là quý đặt cảm biến: chọn nhóm thông tin ở bước 2, quý sau tín hiệu sẽ về.' : 'Các nhóm bạn đang theo dõi không có tín hiệu nào trong quý này.'}
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {signals.map((s) => (
              <SignalRow key={s.id} s={s} d={d} set={set} round={round} />
            ))}
          </ul>
        )}
        {library.length > 0 && (
          <div>
            <button type="button" className="text-sm font-semibold text-ink/70 underline" onClick={() => setOpenLib(!openLib)}>
              {openLib ? '▾' : '▸'} Thư viện bằng chứng đã kiểm chứng ({library.length})
            </button>
            {openLib && (
              <ul className="mt-1.5 grid gap-1.5">
                {library.map((s) => (
                  <SignalRow key={s.id} s={s} d={d} set={set} round={round} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="card space-y-2">
        <h3 className="font-bold">Bước 4 · Cách đặt vấn đề</h3>
        <Choice options={['product', 'job'] as const} value={d.frame} onChange={(f) => set({ ...d, frame: f })} label={(f) => `${SG_FRAME_INFO[f].name} (${SG_FRAME_INFO[f].cost} giờ)`} note={(f) => SG_FRAME_INFO[f].what} cols={1} />
      </div>

      <div className="card space-y-2">
        <h3 className="font-bold">Bước 5 · Quyết định</h3>
        <Choice
          options={SG_ACTIONS}
          value={d.action}
          onChange={(a) => set({ ...d, action: a, target: a === 'none' ? null : d.target })}
          label={(a) => `${SG_ACTION_INFO[a].icon} ${SG_ACTION_INFO[a].name}${SG_ACTION_INFO[a].cost ? ` · ${SG_ACTION_INFO[a].cost} giờ` : ''}`}
          note={(a) => (a === 'none' ? SG_ACTION_INFO[a].what : `${SG_ACTION_INFO[a].what} Tiền về tối đa ${bnv(SG_ACTION_INFO[a].gain, 1)}, mất ${bnv(SG_ACTION_INFO[a].loss, 1)} nếu chuyển dịch không có thật.`)}
          cols={1}
          disabled={(a) => a !== 'none' && a !== d.action && SG_ACTION_INFO[a].cost > left + SG_ACTION_INFO[d.action].cost}
        />
        {d.action !== 'none' && (
          <>
            <p className="pt-1 text-sm font-semibold">Đặt cược vào chuyển dịch nào?</p>
            <Choice
              options={SG_SHIFTS}
              value={(d.target ?? SG_SHIFTS[0]) as SgShift}
              onChange={(t) => set({ ...d, target: t })}
              label={(t) => `${SG_SHIFT_INFO[t].icon} ${SG_SHIFT_INFO[t].name}`}
              note={(t) => `${fitOf(t)} với hành động này · ${pub.bets?.[t] ? `${pub.bets[t]} đơn vị đã đặt cược` : 'chưa ai đặt cược'}`}
              cols={1}
            />
            <p className="text-xs text-ink/50">
              Bằng chứng đã chọn: {d.evidence.length}/{SG_MAX_EVIDENCE}. Mỗi đơn vị khác cùng đánh vào một chuyển dịch làm phần chia nhỏ đi {Math.round(SG_CROWD * 100)}%.
            </p>
          </>
        )}
      </div>

      <div className="card space-y-2">
        <h3 className="font-bold">Bước 6 · Giả thuyết làm việc cho quý sau</h3>
        <p className="text-sm text-ink/60">Chuyển dịch bạn tin là đang diễn ra. Quý sau bạn được thêm một tín hiệu thuộc chuyển dịch đó, kể cả ngoài vùng cảm biến. Giữ một giả thuyết mà dữ liệu đã kiểm chứng của bạn nói là không đúng thì bị trừ kỷ luật thông tin.</p>
        <Choice
          options={['none', ...SG_SHIFTS] as const}
          value={(d.watch ?? 'none') as 'none' | SgShift}
          onChange={(w) => set({ ...d, watch: w === 'none' ? null : (w as SgShift) })}
          label={(w) => (w === 'none' ? 'Chưa chọn giả thuyết' : `${SG_SHIFT_INFO[w as SgShift].icon} ${SG_SHIFT_INFO[w as SgShift].name}`)}
          cols={1}
        />
      </div>

      <details className="card text-sm">
        <summary className="cursor-pointer font-semibold">Bảng tra: hành động nào phù hợp với chuyển dịch nào, và hệ số thời điểm</summary>
        <div className="mt-2 space-y-2">
          <table className="w-full text-xs">
            <thead className="text-left text-ink/60">
              <tr>
                <th className="py-1 pr-2">Chuyển dịch</th>
                <th className="py-1 pr-2">Đúng nhất</th>
                <th className="py-1">Phù hợp</th>
              </tr>
            </thead>
            <tbody>
              {SG_SHIFTS.map((s) => (
                <tr key={s} className="border-t border-ink/10">
                  <td className="py-1 pr-2">
                    {SG_SHIFT_INFO[s].icon} {SG_SHIFT_INFO[s].name}
                  </td>
                  <td className="py-1 pr-2">{SG_ACTION_INFO[SG_FIT[s][0] as SgAction].name}</td>
                  <td className="py-1">{SG_ACTION_INFO[SG_FIT[s][1] as SgAction].name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink/70">
            Hệ số thời điểm: quá sớm ×{fmtNum(SG_WHEN_MUL.premature, 1)} · sớm một quý ×{fmtNum(SG_WHEN_MUL.early, 1)} · đúng quý ×{fmtNum(SG_WHEN_MUL.onTime, 1)} · muộn một quý ×{fmtNum(SG_WHEN_MUL.late, 1)} · muộn hơn ×{fmtNum(SG_WHEN_MUL.tooLate, 1)}. Dùng dữ liệu
            không được phép: phạt {bnv(SG_RESTRICTED_FINE, 1)}. Chưa bao giờ theo dõi đối thủ và công nghệ: mất một phân khúc, {bnv(SG_BLIND_LOSS, 1)}.
          </p>
        </div>
      </details>
    </div>
  );
}

function Report({ report }: { report: SgReport }) {
  const r = report;
  return (
    <div className="card space-y-3">
      <h2 className="font-bold">Kết quả quý {r.round}</h2>
      {r.notes.length > 0 && (
        <ul className="list-disc space-y-1 rounded-xl bg-amber/15 p-3 pl-7 text-sm">
          {r.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {r.checked.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-bold">Kết quả kiểm chứng</h3>
          <ul className="grid gap-1">
            {r.checked.map((s) => (
              <li key={s.id} className="rounded-lg bg-ink/5 px-2 py-1.5 text-xs">
                <QualityTag q={s.quality} />
                <span className="ml-1">{s.shift ? `${SG_SHIFT_INFO[s.shift].icon} ${SG_SHIFT_INFO[s.shift].name}` : 'không nói về chuyển dịch nào'}</span>
                <span className="block text-ink/60">{s.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.lines.length > 0 && (
        <table className="w-full text-sm">
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={i} className="border-t border-ink/10">
                <td className="py-1.5 pr-2">
                  {l.label}
                  {l.note && <span className="block text-xs text-ink/50">{l.note}</span>}
                </td>
                <td className={`py-1.5 text-right font-semibold tabular-nums ${l.value < 0 ? 'text-bad' : 'text-ok'}`}>{bnv(l.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Kv
        rows={[
          ['Hành động', `${SG_ACTION_INFO[r.action].icon} ${SG_ACTION_INFO[r.action].name}${r.target ? ` · ${SG_SHIFT_INFO[r.target].name}` : ''}`],
          ...(r.real !== null ? ([[`Chuyển dịch này`, r.real ? 'có thật' : 'không có thật', !r.real]] as Array<[string, string, boolean]>) : []),
          ['Lợi nhuận quý', bnv(r.profit), r.profit < 0],
          ['Lợi nhuận cộng dồn', bnv(r.profitCum), r.profitCum < 0],
          ['Kỷ luật thông tin của quý', `${r.discipline}%`, r.discipline < 50],
        ]}
      />
    </div>
  );
}

function Market({ room, big }: { room: RsRoomDoc; me?: string; big?: boolean }) {
  const pub = (room.pub ?? {}) as unknown as SgPub;
  const maxBet = Math.max(1, ...SG_SHIFTS.map((s) => pub.bets?.[s] ?? 0));
  return (
    <div className={big ? 'text-lg' : 'text-sm'}>
      <h2 className="mb-2 font-bold">Cả phòng đang đặt cược vào đâu</h2>
      <table className="w-full">
        <tbody>
          {SG_SHIFTS.map((s) => (
            <tr key={s} className="border-t border-ink/10">
              <td className="py-1.5 pr-2">
                {SG_SHIFT_INFO[s].icon} {SG_SHIFT_INFO[s].name}
              </td>
              <td className="w-24 py-1.5">
                <Bar value={pub.bets?.[s] ?? 0} max={maxBet} tone="amber" />
              </td>
              <td className="w-10 py-1.5 text-right tabular-nums">{pub.bets?.[s] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mt-3 mb-1 font-bold">Nhóm thông tin đang được theo dõi</h3>
      <p className="text-ink/70">
        {SG_GROUPS.map((g) => `${SG_GROUP_INFO[g].icon} ${pub.watchers?.[g] ?? 0}`).join(' · ')}
      </p>
    </div>
  );
}

function Reveal({ me }: { me: RsMe<SgReport, SgView>; room: RsRoomDoc }) {
  const truth = me.view?.truth;
  if (!truth) return null;
  return (
    <div className="card space-y-2">
      <h2 className="font-bold">🔓 Lật mô hình ẩn</h2>
      <p className="text-sm text-ink/70">Trong năm chuyển dịch mà thị trường phát tín hiệu, chỉ một số là thật. Đây là bảng mà máy chủ giữ suốt trận.</p>
      <table className="w-full text-sm">
        <thead className="text-left text-ink/60">
          <tr>
            <th className="py-1 pr-2">Chuyển dịch</th>
            <th className="py-1 pr-2">Có thật?</th>
            <th className="py-1">Ăn tiền từ quý</th>
          </tr>
        </thead>
        <tbody>
          {truth.map((t) => (
            <tr key={t.shift} className="border-t border-ink/10">
              <td className="py-1.5 pr-2">
                {SG_SHIFT_INFO[t.shift].icon} {SG_SHIFT_INFO[t.shift].name}
                <span className="block text-xs text-ink/50">{SG_SHIFT_INFO[t.shift].note}</span>
              </td>
              <td className={`py-1.5 pr-2 font-semibold ${t.real ? 'text-ok' : 'text-bad'}`}>{t.real ? 'có thật' : 'chỉ là nhiễu'}</td>
              <td className="py-1.5 tabular-nums">{t.from ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(me.view?.known ?? []).length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Những tín hiệu bạn đã kiểm chứng ({me.view!.known.length})</summary>
          <ul className="mt-1.5 grid gap-1">
            {me.view!.known.map((s) => (
              <li key={s.id} className="rounded-lg bg-ink/5 px-2 py-1.5 text-xs">
                <QualityTag q={s.quality} /> <span className="text-ink/60">quý {s.round} · {s.text}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export const SG_WEB: RsWeb<SgDecision, SgReport, SgView> = {
  id: 'signal-room',
  tag: 'Game 4 · Tín hiệu sớm',
  roundWord: 'Quý',
  rounds: SG_ROUNDS,
  Briefing,
  roundInfo: (round) => SG_QUARTER_INFO[Math.min(SG_QUARTER_INFO.length, Math.max(1, round)) - 1]!,
  initial: (me) => ({
    question: 'growth',
    sensors: [...(me?.view?.sensors ?? [])],
    verify: [],
    aiDigest: me?.view?.ai ?? false,
    frame: 'product',
    action: 'none',
    target: null,
    evidence: [],
    watch: me?.view?.watch ?? null,
  }),
  check: (d) => {
    const spent = sgSpentOf(d);
    if (spent > SG_HOURS) return `Kế hoạch cần ${spent} giờ phân tích, bạn chỉ có ${SG_HOURS}. Bỏ một cảm biến, một lần kiểm chứng hoặc đổi hành động.`;
    if (d.action !== 'none' && !d.target) return 'Chọn chuyển dịch mà hành động này đặt cược vào.';
    return null;
  },
  Form,
  Report,
  Market,
  Reveal,
  cols: [
    { key: 'profit', label: 'Lợi nhuận', fmt: (v) => bnv(v), bad: (v) => v < 0 },
    { key: 'shifts', label: 'Chuyển dịch đã đánh', fmt: (v) => fmtNum(v) },
    { key: 'verified', label: 'Đã kiểm chứng', fmt: (v) => fmtNum(v) },
    { key: 'disc', label: 'Kỷ luật', fmt: (v) => `${fmtNum(v)}%`, bad: (v) => v < 50 },
  ],
  chart: { title: 'Lợi nhuận cộng dồn (tỷ đồng)', fmt: (v) => fmtNum(v, 1), zero: true },
  scoreParts: SG_SCORE_PARTS,
  scoreMax: SG_SCORE_MAX,
  badges: SG_BADGES,
  archetypes: SG_ARCHETYPE_INFO,
  debrief: SG_DEBRIEF,
  scoring: [
    `Lợi nhuận cộng dồn ${SG_SCORE_MAX.profit} điểm (đủ điểm khi đạt ${SG_PROFIT_TARGET} tỷ).`,
    `Chỉ số tín hiệu sớm ${SG_SCORE_MAX.early} điểm: bắt đúng chuyển dịch thật, có bằng chứng đã kiểm chứng, càng sớm càng cao.`,
    `Kỷ luật thông tin ${SG_SCORE_MAX.discipline} điểm: quyết định có bằng chứng kiểm chứng, không dùng tin sai hay tin không được phép dùng.`,
    'Điểm Moodle = 70% thẻ mục tiêu + 30% thứ hạng trong phòng, lấy lần chơi cao nhất.',
  ],
  source: SG_SOURCE,
};
