import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import type { PlayerPublic, RoomDoc } from '@arena/types';
import { api, serverNow } from './api';
import { db } from './firebase';

/** undefined = loading, null = no such room. */
export function useRoom(code: string | undefined) {
  const [room, setRoom] = useState<RoomDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    setRoom(undefined);
    return onSnapshot(
      doc(db, 'rooms', code),
      (snap) => {
        setError(null);
        setRoom(snap.exists() ? (snap.data() as RoomDoc) : null);
      },
      () => setError('Mất kết nối tới phòng. Đang thử lại…'),
    );
  }, [code]);
  return { room, error };
}

/** Server-synchronised clock, re-rendering every `ms`. */
export function useNow(ms = 200) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * Every open screen nudges the server when a deadline passes (closing the question) or when the
 * auto-next delay is over. Calls are idempotent; a little jitter spreads them out.
 */
export function useAutoAdvance(room: RoomDoc | null | undefined, now: number, hostToken?: string) {
  const sent = useRef<string>('');
  useEffect(() => {
    if (!room) return;
    let due: number | null = null;
    if (room.status === 'question' && room.current) due = room.current.deadline + 250;
    if (room.status === 'reveal' && room.reveal && room.settings.autoNextSec > 0) due = room.reveal.revealedAt + room.settings.autoNextSec * 1000 + 250;
    if (due === null || now < due) return;
    const tag = `${room.status}:${room.qIndex}:${Math.floor((now - due) / 4000)}`; // retry every 4 s if nothing moved
    if (sent.current === tag) return;
    sent.current = tag;
    // Fire-and-forget: the clock re-renders every 200 ms, so this timer must not be cleared by the effect cleanup.
    const { code, status, qIndex } = room;
    setTimeout(() => {
      void api.advance(code, { ...(hostToken ? { hostToken } : {}), expectStatus: status, expectQIndex: qIndex }).catch(() => undefined);
    }, Math.random() * 400);
  }, [room, now, hostToken]);
}

export function rankPlayers(room: RoomDoc): PlayerPublic[] {
  return room.order
    .map((id) => room.players[id])
    .filter((p): p is PlayerPublic => Boolean(p))
    .sort((a, b) => b.score - a.score || b.correct - a.correct || a.joinedAt - b.joinedAt);
}

export const humansOf = (room: RoomDoc) => room.order.filter((id) => !room.players[id]?.bot);

/** How many seats have answered the open question (bots count once their planned time has passed). */
export function answeredCount(room: RoomDoc, now: number) {
  const cur = room.current;
  if (!cur) return { done: 0, total: room.order.length };
  let done = 0;
  for (const id of room.order) {
    const p = room.players[id];
    if (p?.bot ? (cur.botAnswerAt[id] ?? Infinity) <= now : room.answered[id]) done++;
  }
  return { done, total: room.order.length };
}
