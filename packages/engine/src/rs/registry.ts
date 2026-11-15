// Danh mục các game nhiều vòng ở phía máy chủ (gồm cả mô hình ẩn – không bao giờ nhập từ trình duyệt).
import { GameError } from '../room.js';
import { JOURNEY_TRUST } from '../jt/game.js';
import { SIGNAL_ROOM } from '../sg/game.js';
import type { RsGame } from './room.js';
import type { RsGameId } from './types.js';

export const RS_GAMES: Partial<Record<RsGameId, RsGame>> = {
  'signal-room': SIGNAL_ROOM,
  'journey-trust': JOURNEY_TRUST,
};

export function rsGame(id: string): RsGame {
  const g = RS_GAMES[id as RsGameId];
  if (!g) throw new GameError('no_game', 'Game này chưa có.', 404);
  return g;
}
export const READY_RS_GAMES = Object.keys(RS_GAMES) as RsGameId[];
