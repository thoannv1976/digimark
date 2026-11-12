import { useEffect, useState } from 'react';
import {
  CATEGORY_LABEL,
  ERROR_TYPES,
  ERROR_TYPE_LABEL,
  type AnswerInput,
  type AnswerKey,
  type Category,
  type ErrorType,
  type HintPayload,
  type PublicQuestion,
} from '@arena/types';

export const CATEGORY_STYLE: Record<Category, string> = {
  spot: 'bg-rose-100 text-rose-800',
  light: 'bg-emerald-100 text-emerald-800',
  prompt: 'bg-violet-100 text-violet-800',
  kpi: 'bg-sky-100 text-sky-800',
  crisis: 'bg-orange-100 text-orange-800',
  gov: 'bg-slate-200 text-slate-800',
};
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function CategoryChip({ category, big }: { category: Category; big?: boolean }) {
  return <span className={`rounded-full px-3 py-1 font-semibold ${big ? 'text-base' : 'text-xs'} ${CATEGORY_STYLE[category]}`}>{CATEGORY_LABEL[category]}</span>;
}

export function QuestionHeader({ q, big }: { q: PublicQuestion; big?: boolean }) {
  return (
    <div className="space-y-3">
      <p className={`font-bold leading-snug ${big ? 'text-3xl' : 'text-lg sm:text-xl'}`}>{q.prompt}</p>
      {q.context && <div className={`whitespace-pre-line rounded-xl bg-ink/5 p-3 leading-relaxed ${big ? 'text-2xl' : 'text-[15px]'}`}>{q.context}</div>}
      {q.table && (
        <div className="overflow-x-auto rounded-xl ring-1 ring-ink/10">
          <table className={`w-full border-collapse ${big ? 'text-xl' : 'text-sm'}`}>
            <thead className="bg-ink text-white">
              <tr>{q.table.headers.map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {q.table.rows.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-ink/5">
                  {r.cells.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface AnswerProps {
  q: PublicQuestion;
  disabled: boolean;
  hint: HintPayload | null;
  onSubmit: (input: AnswerInput) => void;
}

/** Interactive answer area for players. */
export function AnswerArea(props: AnswerProps) {
  if (props.q.kind === 'choice') return <ChoiceAnswer {...props} />;
  if (props.q.kind === 'spot') return <SpotAnswer {...props} />;
  return <OrderAnswer {...props} />;
}

function ChoiceAnswer({ q, disabled, hint, onSubmit }: AnswerProps) {
  const removed = hint?.kind === 'choice' ? hint.removed : [];
  return (
    <div className="grid gap-2.5">
      {(q.options ?? []).map((opt, i) => {
        const gone = removed.includes(i);
        return (
          <button
            key={i}
            type="button"
            disabled={disabled || gone}
            onClick={() => onSubmit({ kind: 'choice', option: i })}
            className={`flex items-start gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium ring-1 transition active:scale-[0.99] ${
              gone ? 'bg-ink/5 text-ink/30 line-through ring-transparent' : 'bg-white ring-ink/15 hover:bg-amber/15 hover:ring-amber'
            }`}
          >
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink text-xs font-bold text-white">{LETTERS[i]}</span>
            <span>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

function SpotAnswer({ q, disabled, hint, onSubmit }: AnswerProps) {
  const [seg, setSeg] = useState<number | null>(null);
  const [type, setType] = useState<ErrorType | null>(hint?.kind === 'spot' ? hint.type : null);
  useEffect(() => {
    if (hint?.kind === 'spot') setType(hint.type);
  }, [hint]);
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white p-3 ring-1 ring-ink/10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Bài AI viết – chạm vào câu sai</p>
        <div className="space-y-1.5 text-[15px] leading-relaxed">
          {(q.segments ?? []).map((s, i) => (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => setSeg(i)}
              className={`block w-full rounded-lg px-2 py-1.5 text-left transition ${seg === i ? 'bg-rose-100 ring-2 ring-rose-400' : 'hover:bg-amber/15'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {hint?.kind === 'spot' && <p className="rounded-lg bg-amber/20 px-3 py-2 text-sm">🔍 Gợi ý: lỗi thuộc loại “{ERROR_TYPE_LABEL[hint.type]}”.</p>}
      <div>
        <p className="mb-2 text-sm font-semibold text-ink/70">Loại lỗi</p>
        <div className="grid grid-cols-2 gap-2">
          {ERROR_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => setType(t)}
              className={`rounded-lg px-2 py-2 text-sm font-medium ring-1 transition ${type === t ? 'bg-ink text-white ring-ink' : 'bg-white ring-ink/15 hover:bg-ink/5'}`}
            >
              {ERROR_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="btn-primary w-full text-lg" disabled={disabled || seg === null || type === null} onClick={() => seg !== null && type && onSubmit({ kind: 'spot', seg, type })}>
        {seg === null ? 'Chọn câu sai' : type === null ? 'Chọn loại lỗi' : 'Gửi câu trả lời'}
      </button>
    </div>
  );
}

function OrderAnswer({ q, disabled, hint, onSubmit }: AnswerProps) {
  const items = q.items ?? [];
  const first = hint?.kind === 'order' ? hint.first : null;
  const [seq, setSeq] = useState<number[]>(first !== null ? [first] : []);
  useEffect(() => {
    if (first !== null) setSeq((s) => (s[0] === first ? s : [first, ...s.filter((x) => x !== first)]));
  }, [first]);
  const toggle = (i: number) => {
    if (i === first) return;
    setSeq((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink/60">Chạm lần lượt theo thứ tự đúng. Chạm lại để bỏ chọn.</p>
      <div className="grid gap-2">
        {items.map((text, i) => {
          const pos = seq.indexOf(i);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => toggle(i)}
              className={`flex items-start gap-3 rounded-xl px-3 py-3 text-left text-[15px] ring-1 transition ${pos >= 0 ? 'bg-ink text-white ring-ink' : 'bg-white ring-ink/15 hover:bg-amber/15'}`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${pos >= 0 ? 'bg-amber text-ink' : 'bg-ink/10 text-ink/40'}`}>{pos >= 0 ? pos + 1 : '·'}</span>
              <span>{text}</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost" disabled={disabled} onClick={() => setSeq(first !== null ? [first] : [])}>
          Làm lại
        </button>
        <button type="button" className="btn-primary flex-1 text-lg" disabled={disabled || seq.length !== items.length} onClick={() => onSubmit({ kind: 'order', order: seq })}>
          {seq.length === items.length ? 'Gửi thứ tự' : `Còn ${items.length - seq.length} bước`}
        </button>
      </div>
    </div>
  );
}

/** Read-only view of the question with the right answer (and optionally the player's own answer). */
export function AnswerReview({ q, answerKey, mine, distribution, big }: { q: PublicQuestion; answerKey: AnswerKey; mine?: AnswerInput; distribution?: number[]; big?: boolean }) {
  const text = big ? 'text-2xl' : 'text-[15px]';
  if (q.kind === 'choice' && answerKey.kind === 'choice') {
    const total = distribution?.reduce((a, b) => a + b, 0) ?? 0;
    return (
      <div className="grid gap-2">
        {(q.options ?? []).map((opt, i) => {
          const right = i === answerKey.option;
          const picked = mine?.kind === 'choice' && mine.option === i;
          const count = distribution?.[i] ?? 0;
          return (
            <div key={i} className={`relative overflow-hidden rounded-xl px-4 py-3 ring-1 ${text} ${right ? 'bg-ok/10 ring-ok' : picked ? 'bg-bad/10 ring-bad' : 'bg-white ring-ink/10'}`}>
              {distribution && total > 0 && <div className={`absolute inset-y-0 left-0 ${right ? 'bg-ok/15' : 'bg-ink/5'}`} style={{ width: `${(count / total) * 100}%` }} />}
              <div className="relative flex items-start gap-3">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white ${right ? 'bg-ok' : picked ? 'bg-bad' : 'bg-ink/40'}`}>{right ? '✓' : picked ? '✗' : LETTERS[i]}</span>
                <span className={`flex-1 ${right ? 'font-semibold' : ''}`}>{opt}</span>
                {distribution && <span className="font-bold text-ink/60">{count}</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  if (q.kind === 'spot' && answerKey.kind === 'spot') {
    return (
      <div className={`space-y-1.5 rounded-xl bg-white p-3 ring-1 ring-ink/10 leading-relaxed ${text}`}>
        {(q.segments ?? []).map((s, i) => {
          const right = i === answerKey.seg;
          const picked = mine?.kind === 'spot' && mine.seg === i;
          return (
            <div key={i} className={`rounded-lg px-2 py-1.5 ${right ? 'bg-ok/10 ring-2 ring-ok' : picked ? 'bg-bad/10 ring-2 ring-bad' : ''}`}>
              {s}
              {right && <div className="mt-1 text-sm font-semibold text-ok">✓ Lỗi: {ERROR_TYPE_LABEL[answerKey.type]}</div>}
              {picked && mine?.kind === 'spot' && (!right || mine.type !== answerKey.type) && (
                <div className="mt-1 text-sm font-semibold text-bad">Bạn chọn: {ERROR_TYPE_LABEL[mine.type]}</div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (q.kind === 'order' && answerKey.kind === 'order') {
    const items = q.items ?? [];
    return (
      <ol className="grid gap-2">
        {answerKey.order.map((idx, pos) => {
          const ok = mine?.kind === 'order' ? mine.order[pos] === idx : undefined;
          return (
            <li key={pos} className={`flex items-start gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-ink/10 ${text}`}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ok text-sm font-bold text-white">{pos + 1}</span>
              <span className="flex-1">{items[idx]}</span>
              {ok !== undefined && <span className={`font-bold ${ok ? 'text-ok' : 'text-bad'}`}>{ok ? '✓' : '✗'}</span>}
            </li>
          );
        })}
      </ol>
    );
  }
  return null;
}

/** Projector view of the open question (no interaction). */
export function QuestionPreview({ q }: { q: PublicQuestion }) {
  if (q.kind === 'choice')
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {(q.options ?? []).map((o, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 text-2xl ring-1 ring-ink/10">
            <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-base font-bold text-white">{LETTERS[i]}</span>
            {o}
          </div>
        ))}
      </div>
    );
  if (q.kind === 'spot')
    return (
      <div className="space-y-2 rounded-xl bg-white p-4 text-2xl leading-relaxed ring-1 ring-ink/10">
        {(q.segments ?? []).map((s, i) => <p key={i}>{s}</p>)}
      </div>
    );
  return (
    <ul className="grid gap-2">
      {(q.items ?? []).map((s, i) => (
        <li key={i} className="rounded-xl bg-white px-4 py-3 text-2xl ring-1 ring-ink/10">{s}</li>
      ))}
    </ul>
  );
}
