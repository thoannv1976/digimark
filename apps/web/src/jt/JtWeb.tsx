// Game 5 "Hành trình và niềm tin" – màn hình người chơi. Chỉ dùng phần công khai của engine (@arena/jt).
import {
  JT_AIS,
  JT_AI_INFO,
  JT_ARCHETYPE_INFO,
  JT_BADGES,
  JT_CONCEAL_CAP,
  JT_CONTRACT,
  JT_CX_INFO,
  JT_DEBRIEF,
  JT_EARNED,
  JT_FIXES,
  JT_FIX_COST,
  JT_FIX_INFO,
  JT_GOVS,
  JT_GOV_INFO,
  JT_MAX_LEVEL,
  JT_MAX_OWNED,
  JT_MAX_PAID,
  JT_MAX_STEPS,
  JT_MEDIA_INFO,
  JT_OWNED_KEEP,
  JT_OWNED_REACH,
  JT_PAID_REACH,
  JT_POINTS,
  JT_QUARTER_INFO,
  JT_RENEW,
  JT_RESPOND_FIRST,
  JT_REV_TARGET,
  JT_RISK_INFO,
  JT_ROUNDS,
  JT_SCORE_MAX,
  JT_SCORE_PARTS,
  JT_SOURCE,
  JT_STAGES,
  JT_STAGE_COST,
  JT_STAGE_INFO,
  JT_STEPS,
  JT_STEP_INFO,
  type JtDecision,
  type JtPub,
  type JtReport,
  type JtStage,
  type JtView,
} from '@arena/jt';
import type { RsMe, RsRoomDoc } from '@arena/rs';
import { Bar, Budget, Choice, Kv, Stepper, bnv, fmtNum, pctv, type RsWeb } from '../rs/parts';

type Me = RsMe<JtReport, JtView> | null;

/** Điểm nguồn lực mà kế hoạch đang dùng (giống hệt phép tính ở máy chủ). */
export function jtSpentOf(d: JtDecision, have: Record<JtStage, number>, fixes: string[]): number {
  let n = 0;
  for (const s of JT_STAGES) {
    for (let lv = (have[s] ?? 0) + 1; lv <= (d.build[s] ?? 0); lv++) n += JT_STAGE_COST[lv - 1] ?? 0;
  }
  n += d.paid + d.owned + JT_GOV_INFO[d.gov].cost + JT_AI_INFO[d.ai].cost;
  n += d.fixes.filter((f) => !fixes.includes(f)).length * JT_FIX_COST;
  return n;
}

function Briefing({ compact }: { compact?: boolean }) {
  return (
    <div className="card space-y-2 text-[15px] leading-relaxed">
      <h2 className="font-bold">🧭 Bạn phụ trách marketing số cho gói khí/LNG</h2>
      <p>
        Sáu đơn vị cùng đi tìm khách trong một tập khách hàng công nghiệp. Mỗi quý có <b>{JT_POINTS} điểm nguồn lực</b>. Hành trình khách hàng có sáu giai đoạn, và
        <b> giai đoạn nào bỏ trống thì khách rơi ngay tại đó</b>.
      </p>
      {!compact && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink/80">
          <li>Trọng số thật của sáu giai đoạn là ẩn. Bạn suy ra từ tỷ lệ đi tiếp trong báo cáo quý trước.</li>
          <li>Paid cho tiếp cận ngay và về 0 khi ngừng chi; Owned lên chậm nhưng cộng dồn thành tài sản.</li>
          <li>Earned không mua được: nó sinh ra từ trải nghiệm và độ tin cậy, rồi nhân hệ số cho toàn bộ tiếp cận.</li>
          <li>Cơ chế phê duyệt và mức kiểm soát nội dung AI quyết định xác suất và mức độ của sự cố truyền thông.</li>
          <li>Sự cố nổ ở quý trước phải xử lý ngay đầu quý sau, và chỉ kịp {JT_MAX_STEPS} bước trong sáu bước của quy trình.</li>
        </ul>
      )}
      <p className="text-sm text-ink/60">
        Thẻ mục tiêu: kết quả kinh doanh {JT_SCORE_MAX.business} + trải nghiệm khách hàng {JT_SCORE_MAX.cx} + thương hiệu và quản trị rủi ro {JT_SCORE_MAX.brand}.
      </p>
    </div>
  );
}

function Form({ room, me, d, set, round }: { room: RsRoomDoc; me: Me; d: JtDecision; set: (d: JtDecision) => void; round: number }) {
  const view = me?.view;
  const have = view?.build ?? (Object.fromEntries(JT_STAGES.map((s) => [s, 0])) as Record<JtStage, number>);
  const owned = view?.fixes ?? [];
  const spent = jtSpentOf(d, have, owned);
  const left = JT_POINTS - spent;
  const last = me?.reports[me.reports.length - 1];
  const passOf = (s: JtStage) => last?.stages.find((x) => x.stage === s)?.pass;
  const open = view?.open ?? null;
  const pub = (room.pub ?? {}) as unknown as JtPub;
  const earnedMul = 1 + JT_EARNED * (view?.cx ?? 0) * (view?.trust ?? 0);
  const reachNow = (JT_PAID_REACH * d.paid + JT_OWNED_REACH * (view?.ownedStock ?? 0)) * JT_GOV_INFO[d.gov].reach * JT_AI_INFO[d.ai].content * earnedMul;

  return (
    <div className="space-y-3">
      <div className="card">
        <Budget spent={spent} total={JT_POINTS} unit="Điểm nguồn lực đã dùng" />
        <Kv
          rows={[
            ['Doanh thu cộng dồn', bnv(view?.revenueCum ?? 0), (view?.revenueCum ?? 0) < 0],
            ['Mục tiêu cả trận', bnv(JT_REV_TARGET)],
            ['Chỉ số trải nghiệm', `${Math.round((view?.cx ?? 0) * 100)}/100`],
            ['Độ tin cậy', `${Math.round((view?.trust ?? 0) * 100)}/100`],
            ['Tài sản Owned', fmtNum(view?.ownedStock ?? 0, 1)],
            ['Hệ số Earned', `×${fmtNum(earnedMul, 2)}`],
            ['Tiếp cận dự kiến quý này', fmtNum(reachNow, 2)],
          ]}
        />
      </div>

      {open && (
        <div className="card space-y-2 ring-2 ring-bad">
          <h3 className="font-bold text-bad">
            ⏱️ 60 phút đầu tiên · {JT_RISK_INFO[open.risk].icon} {JT_RISK_INFO[open.risk].name}
          </h3>
          <p className="rounded-xl bg-bad/10 p-3 text-sm">{JT_RISK_INFO[open.risk].text}</p>
          {JT_RISK_INFO[open.risk].hard && (
            <p className="text-sm font-semibold text-bad">
              Sự cố liên quan an toàn, môi trường hoặc bảo mật: che giấu hoặc trì hoãn nghĩa vụ thông báo là vi phạm. Điểm thương hiệu sẽ bị chặn ở {Math.round(JT_CONCEAL_CAP * 100)}% và không kiếm lại được bằng điểm kinh
              doanh.
            </p>
          )}
          <p className="text-sm text-ink/70">
            Chọn đúng {JT_MAX_STEPS} việc. Phản hồi trước khi xác minh làm thiệt hại tăng ×{JT_RESPOND_FIRST}.
          </p>
          <div className="grid gap-1.5">
            {JT_STEPS.map((s) => {
              const on = d.response.includes(s);
              const info = JT_STEP_INFO[s];
              return (
                <button
                  key={s}
                  type="button"
                  disabled={!on && d.response.length >= JT_MAX_STEPS}
                  onClick={() => set({ ...d, response: on ? d.response.filter((x) => x !== s) : [...d.response, s] })}
                  className={`rounded-xl px-3 py-2 text-left text-sm ring-1 disabled:opacity-40 ${on ? (info.bad ? 'bg-bad text-white ring-bad' : 'bg-ink text-white ring-ink') : 'bg-white ring-ink/15'}`}
                >
                  <span className="font-semibold">
                    {on ? `${d.response.indexOf(s) + 1}. ` : ''}
                    {info.name}
                  </span>
                  <span className={`block text-xs ${on ? 'text-white/75' : 'text-ink/50'}`}>{info.what}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-ink/50">
            Đã chọn {d.response.length}/{JT_MAX_STEPS}
          </p>
        </div>
      )}

      <div className="card space-y-2">
        <h3 className="font-bold">Hành trình khách hàng</h3>
        <p className="text-sm text-ink/60">Tỷ lệ đi tiếp của quý trước cho bạn biết khách rơi ở đâu. Giai đoạn nào rơi nhiều nhất thì giai đoạn đó nặng với nhóm khách này.</p>
        <div className="grid gap-1.5">
          {JT_STAGES.map((s) => {
            const info = JT_STAGE_INFO[s];
            const cur = d.build[s];
            const base = have[s];
            const up = cur < JT_MAX_LEVEL ? JT_STAGE_COST[cur] ?? 0 : null;
            const pass = passOf(s);
            return (
              <div key={s} className={`rounded-xl px-3 py-2 ring-1 ${cur === 0 ? 'bg-bad/5 ring-bad/30' : 'bg-white ring-ink/10'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {info.icon} {info.name} · cấp {cur}/{JT_MAX_LEVEL}
                    </p>
                    <p className="text-xs text-ink/50">“{info.ask}” → {info.role}</p>
                    <p className="mt-0.5 text-xs text-ink/70">{cur > 0 ? info.levels[cur - 1] : 'chưa có điểm chạm nào ở giai đoạn này'}</p>
                    {pass !== undefined && (
                      <p className="mt-0.5 text-xs">
                        <span className={pass < 0.6 ? 'font-semibold text-bad' : 'text-ink/60'}>Quý trước: {pctv(pass)} đi tiếp</span>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="Giảm"
                      className="h-8 w-8 rounded-lg bg-ink/10 font-bold disabled:opacity-30"
                      disabled={cur <= base}
                      onClick={() => set({ ...d, build: { ...d.build, [s]: cur - 1 } })}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      aria-label="Tăng"
                      className="h-8 w-8 rounded-lg bg-ink font-bold text-white disabled:opacity-30"
                      disabled={up === null || up > left}
                      onClick={() => set({ ...d, build: { ...d.build, [s]: cur + 1 } })}
                    >
                      +
                    </button>
                  </div>
                </div>
                {up !== null && <p className="mt-1 text-[11px] text-ink/40">Lên cấp {cur + 1}: {up} điểm — {info.levels[cur]}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card space-y-2">
        <h3 className="font-bold">Owned · Paid · Earned</h3>
        <Stepper label={`💳 Paid – tiếp cận trong quý (${JT_PAID_REACH} / điểm)`} value={d.paid} onChange={(v) => set({ ...d, paid: v })} max={Math.min(JT_MAX_PAID, d.paid + left)} show={(v) => `${v} điểm`} />
        <Stepper label={`🏠 Owned – thêm vào tài sản số (${JT_OWNED_REACH} / đơn vị, giữ ${Math.round(JT_OWNED_KEEP * 100)}% mỗi quý)`} value={d.owned} onChange={(v) => set({ ...d, owned: v })} max={Math.min(JT_MAX_OWNED, d.owned + left)} show={(v) => `${v} điểm`} />
        <p className="rounded-xl bg-ink/5 p-2.5 text-xs leading-relaxed text-ink/70">
          <b>{JT_MEDIA_INFO.paid.name}:</b> {JT_MEDIA_INFO.paid.what}
          <br />
          <b>{JT_MEDIA_INFO.owned.name}:</b> {JT_MEDIA_INFO.owned.what}
          <br />
          <b>{JT_MEDIA_INFO.earned.name}:</b> {JT_MEDIA_INFO.earned.what} Hệ số hiện tại của bạn: ×{fmtNum(earnedMul, 2)}.
        </p>
      </div>

      <div className="card space-y-2">
        <h3 className="font-bold">Quản trị nội dung</h3>
        <Choice options={JT_GOVS} value={d.gov} onChange={(g) => set({ ...d, gov: g })} label={(g) => `${JT_GOV_INFO[g].name} (${JT_GOV_INFO[g].cost} điểm)`} note={(g) => `${JT_GOV_INFO[g].what} Xác suất sự cố ×${JT_GOV_INFO[g].risk}, mức độ ×${JT_GOV_INFO[g].severity}, tiếp cận ×${JT_GOV_INFO[g].reach}.`} cols={1} />
        <h3 className="pt-1 font-bold">Nội dung do AI tạo</h3>
        <Choice options={JT_AIS} value={d.ai} onChange={(a) => set({ ...d, ai: a })} label={(a) => `${JT_AI_INFO[a].name} (${JT_AI_INFO[a].cost} điểm)`} note={(a) => `${JT_AI_INFO[a].what} Nội dung ×${JT_AI_INFO[a].content}, cộng thêm ${Math.round(JT_AI_INFO[a].risk * 100)}% xác suất sự cố.`} cols={1} />
      </div>

      <div className="card space-y-2">
        <h3 className="font-bold">Điểm đau cần sửa</h3>
        <p className="text-sm text-ink/60">Sửa một lần, có hiệu lực mãi. Trải nghiệm là thứ sinh ra Earned Media.</p>
        <div className="grid gap-1.5">
          {JT_FIXES.map((f) => {
            const on = d.fixes.includes(f);
            const paid = owned.includes(f);
            const info = JT_FIX_INFO[f];
            return (
              <button
                key={f}
                type="button"
                disabled={paid || (!on && left < JT_FIX_COST)}
                onClick={() => set({ ...d, fixes: on ? d.fixes.filter((x) => x !== f) : [...d.fixes, f] })}
                className={`rounded-xl px-3 py-2 text-left text-sm ring-1 disabled:opacity-100 ${on ? 'bg-ink text-white ring-ink' : 'bg-white ring-ink/15 disabled:opacity-40'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {info.icon} {info.name}
                  </span>
                  <span className="shrink-0 text-xs">{paid ? 'đã sửa' : `${JT_FIX_COST} điểm`}</span>
                </span>
                <span className={`block text-xs ${on ? 'text-white/70' : 'text-ink/50'}`}>
                  {info.pain} Giúp: {info.helps.map((s) => JT_STAGE_INFO[s].name).join(', ')}.
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <details className="card text-sm">
        <summary className="cursor-pointer font-semibold">Bảng tra: chỉ số trải nghiệm, ma trận rủi ro, cách ra tiền</summary>
        <div className="mt-2 space-y-2 text-xs leading-relaxed text-ink/75">
          <p>
            <b>Ra tiền:</b> tiếp cận × {fmtNum(2, 0)} khách tiềm năng mỗi đơn vị, đi qua sáu giai đoạn, ai còn lại sau bước Mua hàng thành hợp đồng mới ({JT_CONTRACT} tỷ/hợp đồng); ai đi hết tới Gắn bó sẽ tái ký quý sau (
            {JT_RENEW} tỷ). Mục tiêu cả trận {JT_REV_TARGET} tỷ.
          </p>
          <p>
            <b>Chỉ số trải nghiệm:</b> {JT_CX_INFO.map((c) => `${c.name} (${c.what})`).join(' · ')}.
          </p>
          <p>
            <b>Ma trận rủi ro:</b> điểm rủi ro = khả năng xảy ra × mức độ tác động. Hiện tại của bạn: {view?.riskScore ? `${view.riskScore.likelihood}/5 × ${view.riskScore.impact}/5 = ${view.riskScore.likelihood * view.riskScore.impact}/25` : '–'}{' '}
            (1–7 thấp, 8–14 trung bình, 15–25 cao).
          </p>
          <p>
            <b>Cả phòng:</b> trải nghiệm trung bình {Math.round((pub.cx ?? 0) * 100)}/100 · {pub.open ?? 0} sự cố đang mở · {pub.incidents ?? 0} sự cố đã nổ.
          </p>
          <p className="text-ink/50">Quý {round}/{JT_ROUNDS}</p>
        </div>
      </details>
    </div>
  );
}

function Report({ report }: { report: JtReport }) {
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
      {r.resolved && (
        <div className="rounded-xl bg-bad/10 p-3 text-sm">
          <p className="font-bold">
            {JT_RISK_INFO[r.resolved.risk].icon} {JT_RISK_INFO[r.resolved.risk].name} – đã xử lý
          </p>
          <p className="text-ink/70">Bạn chọn: {(r.resolved.steps ?? []).map((s) => JT_STEP_INFO[s].name).join(' → ') || 'không chọn gì'}</p>
          <p className="text-ink/70">Đánh giá: {r.resolved.verdict}</p>
          <p className="font-semibold text-bad">Thiệt hại {bnv(r.resolved.damage ?? 0)}</p>
        </div>
      )}
      <div>
        <h3 className="mb-1 text-sm font-bold">Phễu của quý</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-ink/60">
            <tr>
              <th className="py-1 pr-2">Giai đoạn</th>
              <th className="py-1 pr-2 text-right">Vào</th>
              <th className="py-1 pr-2 text-right">Đi tiếp</th>
              <th className="py-1 text-right">Rơi</th>
            </tr>
          </thead>
          <tbody>
            {r.stages.map((s) => (
              <tr key={s.stage} className="border-t border-ink/10">
                <td className="py-1.5 pr-2">
                  {JT_STAGE_INFO[s.stage].icon} {JT_STAGE_INFO[s.stage].name}
                  <span className="ml-1 text-xs text-ink/50">cấp {s.level}</span>
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNum(s.inFlow, 1)}</td>
                <td className={`py-1.5 pr-2 text-right tabular-nums ${s.pass < 0.6 ? 'font-semibold text-bad' : ''}`}>{pctv(s.pass)}</td>
                <td className="py-1.5 text-right tabular-nums text-ink/60">{fmtNum(s.lost, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Kv
        rows={[
          ['Tiếp cận', fmtNum(r.reach, 2)],
          ['Tài sản Owned', fmtNum(r.ownedStock, 1)],
          ['Hệ số Earned', `×${fmtNum(r.earnedMul, 2)}`],
          ['Hợp đồng mới', fmtNum(r.contracts, 1)],
          ['Khách sẽ tái ký quý sau', fmtNum(r.kept, 1)],
          ['Doanh thu quý', bnv(r.revenue), r.revenue < 0],
          ['Doanh thu cộng dồn', bnv(r.revenueCum), r.revenueCum < 0],
        ]}
      />
      <div>
        <h3 className="mb-1 text-sm font-bold">Trải nghiệm khách hàng</h3>
        <Kv
          rows={[
            ...JT_CX_INFO.map((c) => {
              const v = r.cxRows.find((x) => x.key === c.key)?.value ?? 0;
              return [c.name, c.key === 'response' ? `${v} giờ` : c.key === 'nps' ? fmtNum(v, 1) : `${v}`] as [string, string];
            }),
            ['Chỉ số trải nghiệm', `${Math.round(r.cx * 100)}/100`],
            ['Độ tin cậy', `${Math.round(r.trust * 100)}/100`],
          ]}
        />
      </div>
      {r.opened && (
        <p className="rounded-xl bg-amber/20 p-3 text-sm font-semibold">
          ⚠️ Sự cố mới: {JT_RISK_INFO[r.opened.risk].icon} {JT_RISK_INFO[r.opened.risk].name}. Đầu quý sau bạn phải xử lý, và chỉ kịp {JT_MAX_STEPS} bước.
        </p>
      )}
    </div>
  );
}

function Market({ room, big }: { room: RsRoomDoc; me?: string; big?: boolean }) {
  const pub = (room.pub ?? {}) as unknown as JtPub;
  const ids = room.order;
  const maxRev = Math.max(1, ...ids.map((id) => room.standings[id]?.cols.revenue ?? 0));
  return (
    <div className={big ? 'text-lg' : 'text-sm'}>
      <h2 className="mb-2 font-bold">Cả phòng</h2>
      <Kv
        rows={[
          ['Trải nghiệm trung bình', `${Math.round((pub.cx ?? 0) * 100)}/100`],
          ['Sự cố đang mở', String(pub.open ?? 0)],
          ['Sự cố đã nổ', String(pub.incidents ?? 0)],
        ]}
      />
      <table className="mt-2 w-full">
        <tbody>
          {ids.map((id) => {
            const s = room.standings[id];
            return (
              <tr key={id} className="border-t border-ink/10">
                <td className="py-1.5 pr-2">{room.players[id]?.name}</td>
                <td className="w-24 py-1.5">
                  <Bar value={s?.cols.revenue ?? 0} max={maxRev} tone="ok" />
                </td>
                <td className="w-20 py-1.5 text-right tabular-nums">{bnv(s?.cols.revenue ?? 0, 1)}</td>
                <td className="w-16 py-1.5 text-right tabular-nums text-ink/60">{s?.cols.cx ?? 0}/100</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-ink/50">Cột: doanh thu cộng dồn · chỉ số trải nghiệm</p>
    </div>
  );
}

function Reveal({ me }: { me: RsMe<JtReport, JtView>; room: RsRoomDoc }) {
  const truth = me.view?.truth;
  if (!truth) return null;
  const maxW = Math.max(...truth.weights.map((w) => w.weight));
  return (
    <div className="card space-y-3">
      <h2 className="font-bold">🔓 Trọng số thật của sáu giai đoạn</h2>
      <p className="text-sm text-ink/70">Đây là bảng mà máy chủ giữ suốt trận. Với khách hàng công nghiệp mua khí/LNG, bước Đánh giá nặng nhất: họ cần hồ sơ, tiêu chuẩn và số liệu kiểm chứng.</p>
      <table className="w-full text-sm">
        <tbody>
          {truth.weights.map((w) => (
            <tr key={w.stage} className="border-t border-ink/10">
              <td className="py-1.5 pr-2">
                {JT_STAGE_INFO[w.stage].icon} {JT_STAGE_INFO[w.stage].name}
              </td>
              <td className="w-28 py-1.5">
                <Bar value={w.weight} max={maxW} tone={w.weight >= maxW ? 'bad' : 'amber'} />
              </td>
              <td className="w-16 py-1.5 text-right tabular-nums">{pctv(w.weight)}</td>
              <td className="w-16 py-1.5 text-right text-xs text-ink/60">cấp {me.view?.build[w.stage] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {truth.incidents.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-bold">Toàn bộ sự cố của bạn</h3>
          <ul className="grid gap-1.5">
            {truth.incidents.map((x, i) => (
              <li key={i} className="rounded-lg bg-ink/5 px-2 py-1.5 text-xs">
                <span className="font-semibold">
                  {JT_RISK_INFO[x.risk].icon} {JT_RISK_INFO[x.risk].name}
                </span>{' '}
                · quý {x.round} · {(x.steps ?? []).map((s) => JT_STEP_INFO[s].name).join(' → ') || 'không xử lý'} · thiệt hại {bnv(x.damage ?? 0)}
                <span className="block text-ink/60">{x.verdict ?? 'chưa xử lý'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {me.view?.concealed && <p className="rounded-xl bg-bad/10 p-3 text-sm font-semibold text-bad">Bạn đã che giấu hoặc không chuyển cấp một sự cố an toàn, môi trường hoặc bảo mật. Điểm thương hiệu bị chặn trần từ quý đó.</p>}
    </div>
  );
}

export const JT_WEB: RsWeb<JtDecision, JtReport, JtView> = {
  id: 'journey-trust',
  tag: 'Game 5 · Hành trình và niềm tin',
  roundWord: 'Quý',
  rounds: JT_ROUNDS,
  Briefing,
  roundInfo: (round) => JT_QUARTER_INFO[Math.min(JT_QUARTER_INFO.length, Math.max(1, round)) - 1]!,
  initial: (me) => ({
    build: { ...(me?.view?.build ?? (Object.fromEntries(JT_STAGES.map((s) => [s, 0])) as Record<JtStage, number>)) },
    paid: 0,
    owned: 0,
    gov: me?.view?.gov ?? 'fast',
    ai: me?.view?.ai ?? 'direct',
    fixes: [...(me?.view?.fixes ?? [])],
    response: [],
  }),
  check: (d, me) => {
    const have = me?.view?.build ?? (Object.fromEntries(JT_STAGES.map((s) => [s, 0])) as Record<JtStage, number>);
    const spent = jtSpentOf(d, have, me?.view?.fixes ?? []);
    if (spent > JT_POINTS) return `Kế hoạch cần ${spent} điểm nguồn lực, bạn chỉ có ${JT_POINTS}.`;
    if (me?.view?.open && d.response.length === 0) return 'Đang có một sự cố chờ xử lý. Chọn ba việc cho 60 phút đầu tiên.';
    return null;
  },
  Form,
  Report,
  Market,
  Reveal,
  cols: [
    { key: 'revenue', label: 'Doanh thu', fmt: (v) => bnv(v, 1), bad: (v) => v < 0 },
    { key: 'cx', label: 'Trải nghiệm', fmt: (v) => `${fmtNum(v)}`, bad: (v) => v < 40 },
    { key: 'trust', label: 'Tin cậy', fmt: (v) => `${fmtNum(v)}`, bad: (v) => v < 40 },
    { key: 'stages', label: 'Tổng cấp điểm chạm', fmt: (v) => fmtNum(v) },
    { key: 'incidents', label: 'Sự cố', fmt: (v) => fmtNum(v), bad: (v) => v >= 2 },
  ],
  chart: { title: 'Doanh thu cộng dồn (tỷ đồng)', fmt: (v) => fmtNum(v, 1), zero: true },
  scoreParts: JT_SCORE_PARTS,
  scoreMax: JT_SCORE_MAX,
  badges: JT_BADGES,
  archetypes: JT_ARCHETYPE_INFO,
  debrief: JT_DEBRIEF,
  scoring: [
    `Kết quả kinh doanh ${JT_SCORE_MAX.business} điểm (đủ điểm khi đạt ${JT_REV_TARGET} tỷ doanh thu cộng dồn).`,
    `Trải nghiệm khách hàng ${JT_SCORE_MAX.cx} điểm: trung bình chỉ số trải nghiệm qua năm quý.`,
    `Thương hiệu và quản trị rủi ro ${JT_SCORE_MAX.brand} điểm: nhất quán giữa lời hứa và trải nghiệm, xác thực, phân quyền phê duyệt và chất lượng xử lý sự cố.`,
    'Điểm Moodle = 70% thẻ mục tiêu + 30% thứ hạng trong phòng, lấy lần chơi cao nhất.',
  ],
  source: JT_SOURCE,
};
