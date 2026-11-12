import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BOT_LEVEL_LABEL, type BotLevel } from '@arena/types';
import { ErrorNote, Shell } from '../components/common';
import { api } from '../lib/api';
import { getName, setName, setSession } from '../lib/storage';

export function Home() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [name, setNameState] = useState(getName());
  const [level, setLevel] = useState<BotLevel>('medium');
  const [count, setCount] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length >= 4) nav(`/p/${c}`);
  };

  async function create(withBotsNow: boolean) {
    const n = name.trim();
    if (!n) return setError('Nhập tên của bạn trước nhé.');
    setBusy(true);
    setError(null);
    try {
      setName(n);
      const r = await api.createRoom({ hostPlays: true, hostName: n, settings: { botLevel: level, questionCount: count, fillBots: true } });
      setSession(r.code, { playerId: r.playerId!, playerToken: r.playerToken!, hostToken: r.hostToken });
      if (withBotsNow) await api.start(r.code, r.hostToken);
      nav(`/p/${r.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được phòng.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell right={<Link to="/gv" className="text-sm font-medium text-white/80 hover:text-white">Giảng viên →</Link>}>
      <section className="mb-5 rounded-2xl bg-ink p-5 text-white">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber">Game 2</p>
        <h1 className="mt-1 text-3xl font-extrabold">Thám tử AI</h1>
        <p className="mt-2 text-white/80">Đấu nhanh 6 người: bắt lỗi bài AI viết, phân loại dữ liệu, chọn prompt, đọc số liệu và xử lý khủng hoảng. Nhanh và đúng thì thắng.</p>
      </section>

      <form onSubmit={join} className="card mb-4">
        <h2 className="mb-3 text-lg font-bold">Vào phòng của lớp</h2>
        <div className="flex gap-2">
          <input
            className="input text-center text-2xl font-extrabold uppercase tracking-[0.3em]"
            placeholder="MÃ PHÒNG"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            aria-label="Mã phòng"
          />
          <button className="btn-dark shrink-0" disabled={code.trim().length < 4}>
            Vào
          </button>
        </div>
      </form>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Tự luyện hoặc chơi với bạn</h2>
        <div>
          <label className="label" htmlFor="name">Tên của bạn</label>
          <input id="name" className="input" maxLength={24} value={name} onChange={(e) => setNameState(e.target.value)} placeholder="Ví dụ: Lan – Phòng Kinh doanh" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label">Mức máy chơi</span>
            <div className="grid grid-cols-3 gap-1">
              {(Object.keys(BOT_LEVEL_LABEL) as BotLevel[]).map((l) => (
                <button key={l} type="button" onClick={() => setLevel(l)} className={`rounded-lg py-2 text-sm font-semibold ring-1 ${level === l ? 'bg-ink text-white ring-ink' : 'ring-ink/15'}`}>
                  {BOT_LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Số câu</span>
            <div className="grid grid-cols-3 gap-1">
              {[10, 15, 20].map((n) => (
                <button key={n} type="button" onClick={() => setCount(n)} className={`rounded-lg py-2 text-sm font-semibold ring-1 ${count === n ? 'bg-ink text-white ring-ink' : 'ring-ink/15'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ErrorNote text={error} />
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => create(true)}>
            🤖 Đấu ngay với 5 máy
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => create(false)}>
            Tạo phòng mời bạn
          </button>
        </div>
        <p className="text-xs text-ink/50">Phòng mời bạn: gửi mã cho tối đa 5 người; ghế trống được máy chơi thay khi bắt đầu.</p>
      </section>

      <section className="mt-4 card text-sm leading-relaxed text-ink/80">
        <h2 className="mb-2 text-base font-bold text-ink">Cách tính điểm</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Đúng: tối đa 1.000 điểm, trả lời càng nhanh càng cao (chậm nhất còn 500).</li>
          <li>Đúng liên tiếp: thưởng thêm 10% mỗi câu, tối đa +50%.</li>
          <li>Sai hoàn toàn: −200 điểm. Không trả lời: 0 điểm. Đừng bấm bừa!</li>
          <li>Bắt lỗi AI: đúng câu sai nhưng sai loại lỗi được 60%. Sắp xếp: đúng bao nhiêu vị trí được bấy nhiêu phần.</li>
          <li>🔍 Kiểm chứng (2 lượt/trận): loại bớt phương án hoặc gợi ý, nhưng câu đó chỉ còn một nửa số điểm.</li>
        </ul>
      </section>
    </Shell>
  );
}
