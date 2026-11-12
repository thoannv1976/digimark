// Moodle connection through UniGame Hub (LTI 1.3). Mirrors unigame-hub/sdk/index.ts (verify ticket, submit result).
// Off unless LTI_ENABLED=true; the shared secret comes from Secret Manager (LTI_GAME_SECRET).
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose';

export const TICKET_TYP = 'unigamehub-launch+jwt';

export interface LtiConfig {
  hubUrl: string;
  gameId: string;
  secret: string;
  /** Tests inject a local key set; production reads the Hub's /lti/jwks. */
  jwks?: JWTVerifyGetKey;
  fetch?: typeof fetch;
}

export function ltiConfigFromEnv(env: NodeJS.ProcessEnv): LtiConfig | null {
  if (env.LTI_ENABLED !== 'true') return null;
  const hubUrl = env.LTI_HUB_URL?.replace(/\/+$/, '');
  const secret = env.LTI_GAME_SECRET;
  if (!hubUrl || !secret) throw new Error('LTI_ENABLED=true needs LTI_HUB_URL and LTI_GAME_SECRET');
  return { hubUrl, gameId: env.LTI_GAME_ID ?? 'digimark', secret };
}

export interface LaunchContext {
  ticketId: string;
  hubUserId: string;
  tenantId: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  username?: string;
  role: 'instructor' | 'learner';
  context?: { id: string; title?: string; label?: string };
  resourceLink: { id: string; title?: string };
  activity?: string;
  gradeTarget?: string;
  expiresAt: Date;
}

const jwksCache = new Map<string, JWTVerifyGetKey>();

export async function verifyTicket(cfg: LtiConfig, ticket: string): Promise<LaunchContext> {
  let jwks = cfg.jwks ?? jwksCache.get(cfg.hubUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${cfg.hubUrl}/lti/jwks`));
    jwksCache.set(cfg.hubUrl, jwks);
  }
  const { payload, protectedHeader } = await jwtVerify(ticket, jwks, {
    issuer: cfg.hubUrl,
    audience: cfg.gameId,
    algorithms: ['RS256'],
    typ: TICKET_TYP,
    maxTokenAge: '5m',
  });
  if (protectedHeader.typ !== TICKET_TYP || !payload.jti || !payload.sub || !payload.exp) throw new Error('Bad ticket');
  const c = payload.ugh as Omit<LaunchContext, 'ticketId' | 'hubUserId' | 'expiresAt'>;
  return { ...c, ticketId: payload.jti, hubUserId: payload.sub, expiresAt: new Date(payload.exp * 1000) };
}

export interface ResultInput {
  gradeTarget: string;
  attemptId: string;
  score: number;
  maxScore: number;
  occurredAt: string;
  comment?: string;
}

export async function submitResult(cfg: LtiConfig, r: ResultInput): Promise<string> {
  const token = await new SignJWT({
    result: {
      grade_target: r.gradeTarget,
      attempt_id: r.attemptId,
      score: r.score,
      max_score: r.maxScore,
      occurred_at: r.occurredAt,
      activity_progress: 'Completed',
      grading_progress: 'FullyGraded',
      ...(r.comment ? { comment: r.comment } : {}),
    },
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'unigamehub-result+jwt' })
    .setIssuer(cfg.gameId)
    .setAudience(cfg.hubUrl)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setJti(crypto.randomUUID())
    .sign(new TextEncoder().encode(cfg.secret));
  const res = await (cfg.fetch ?? fetch)(`${cfg.hubUrl}/api/v1/results`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ result_token: token }),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
  if (!res.ok) throw new Error(`Hub rejected result (${res.status}): ${body.error ?? 'unknown'}`);
  return body.status ?? 'queued';
}

export const displayName = (c: LaunchContext) =>
  (c.name || [c.givenName, c.familyName].filter(Boolean).join(' ') || c.username || 'Học viên').trim().slice(0, 24);
