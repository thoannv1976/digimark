// Khung round-sim: hình dạng phòng công khai dùng chung cho các game nhiều vòng (Game 4, Game 5 …).
// An toàn cho trình duyệt: không có mô hình ẩn ở đây. Mỗi game thêm khối nội dung riêng (sg/types.ts, jt/types.ts).
import type { BotLevel } from '../types.js';

export type RsGameId = 'signal-room' | 'journey-trust';
export const RS_GAME_IDS: RsGameId[] = ['signal-room', 'journey-trust'];
export const isRsGameId = (g: unknown): g is RsGameId => typeof g === 'string' && (RS_GAME_IDS as string[]).includes(g);

export interface RsSettings {
  /** Giây cho mỗi vòng; 0 = không giới hạn (chủ phòng tự chốt). */
  decideSec: number;
  /** Giây giữ màn hình kết quả trước khi mở vòng sau; 0 = chủ phòng tự chuyển. */
  resultsSec: number;
  botLevel: BotLevel;
  fillBots: boolean;
}

export interface RsPlayerPublic {
  id: string;
  name: string;
  bot: boolean;
  level?: BotLevel;
  archetype?: string;
  joinedAt: number;
  lms?: boolean;
}

export interface RsStanding {
  /** Thẻ mục tiêu 0–100 tới thời điểm này (khóa xếp hạng). */
  score: number;
  rank: number;
  /** Các cột riêng của từng game cho bảng xếp hạng. */
  cols: Record<string, number>;
  defaulted?: boolean;
  /** Nhãn trạng thái ngắn, ví dụ 'frozen'. */
  flag?: string;
}

export interface RsRoomDoc {
  code: string;
  game: RsGameId;
  title: string;
  status: 'lobby' | 'decide' | 'results' | 'finished';
  createdAt: number;
  hostPlays: boolean;
  hostPlayerId: string | null;
  settings: RsSettings;
  players: Record<string, RsPlayerPublic>;
  order: string[];
  round: number;
  rounds: number;
  openedAt: number | null;
  deadline: number | null;
  submitted: Record<string, boolean>;
  standings: Record<string, RsStanding>;
  /** Một số liệu tiêu biểu cho mỗi đơn vị, mỗi vòng (dùng vẽ biểu đồ). */
  history: { round: number; values: Record<string, number> }[];
  /** Tin thị trường của vòng vừa rồi. */
  news: string[];
  /** Dữ liệu công khai riêng của game (mức độ đông, trạng thái thuế …). */
  pub: Record<string, unknown>;
  revealedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  version: number;
  lmsStatus?: Record<string, 'sent' | 'error'>;
}

export interface RsScorecard {
  total: number;
  parts: Record<string, number>;
}

export interface RsMe<R = unknown, V = unknown> {
  playerId: string;
  reports: R[];
  pending: unknown | null;
  scorecard: RsScorecard;
  grade: number | null;
  /** Phần riêng tư của từng người (tiền, mô hình ẩn được lật khi kết thúc …). */
  view: V;
  badges: string[];
}
