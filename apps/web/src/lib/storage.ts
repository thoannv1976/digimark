// localStorage can be unavailable (private mode, blocked site data): every access is guarded.
import type { HintPayload } from '@arena/types';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export interface Session {
  playerId?: string;
  playerToken?: string;
  hostToken?: string;
}

const memory = new Map<string, Session>();
export const getSession = (code: string): Session | null => memory.get(code) ?? read<Session | null>(`arena:room:${code}`, null);
export function setSession(code: string, s: Session) {
  memory.set(code, s);
  write(`arena:room:${code}`, s);
}
export function clearSession(code: string) {
  memory.delete(code);
  write(`arena:room:${code}`, null);
}

export const getName = () => read<string>('arena:name', '');
export const setName = (name: string) => write('arena:name', name);

export interface HostedRoom {
  code: string;
  hostToken: string;
  title: string;
  createdAt: number;
}
export const getHostedRooms = () => read<HostedRoom[]>('arena:gv:rooms', []);
export const setHostedRooms = (rooms: HostedRoom[]) => write('arena:gv:rooms', rooms);

export interface LtiSession {
  session: string;
  role: 'instructor' | 'learner';
  name: string;
  contextTitle: string | null;
  graded: boolean;
  at: number;
}
const LTI_MAX_AGE = 12 * 3600 * 1000;
export function getLti(): LtiSession | null {
  const s = read<LtiSession | null>('arena:lti', null);
  return s && Date.now() - s.at < LTI_MAX_AGE ? s : null;
}
export const setLti = (s: LtiSession | null) => write('arena:lti', s);

export const getHint = (code: string, qIndex: number) => read<HintPayload | null>(`arena:hint:${code}:${qIndex}`, null);
export const setHint = (code: string, qIndex: number, hint: HintPayload) => write(`arena:hint:${code}:${qIndex}`, hint);
