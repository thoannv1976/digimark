import type { RsGameId } from '@arena/rs';
import { JT_WEB } from '../jt/JtWeb';
import { SG_WEB } from '../sg/SgWeb';
import type { RsWeb } from './parts';

export const RS_WEB: Record<RsGameId, RsWeb> = {
  'signal-room': SG_WEB,
  'journey-trust': JT_WEB,
};

export const rsWebOf = (id: string): RsWeb | null => RS_WEB[id as RsGameId] ?? null;
