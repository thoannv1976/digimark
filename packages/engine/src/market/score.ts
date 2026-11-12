// Ranking ("giá trị doanh nghiệp") and the absolute scorecard ("mục tiêu ban lãnh đạo 2027").
import { SEGMENT_MODEL } from './model.js';
import type { MarketState, PlayerState } from './sim.js';
import { SEGMENTS, START_RATING_FOR_SCORE, TARGETS, type Scorecard } from './types.js';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function scorecardOf(state: MarketState, id: string, lastNonfuelPct: number): Scorecard {
  const p = state.players[id]!;
  const nonfuel = 25 * clamp01(lastNonfuelPct / TARGETS.nonfuelPct);
  const repurchase = 25 * clamp01((p.repurchase - 0.57) / (TARGETS.repurchase - 0.57));
  const rating = 25 * clamp01((p.rating - START_RATING_FOR_SCORE) / (TARGETS.rating - START_RATING_FOR_SCORE));
  const crisis = p.crisis ?? 0;
  const r = (v: number) => Math.round(v * 10) / 10;
  return { nonfuel: r(nonfuel), repurchase: r(repurchase), rating: r(rating), crisis: r(crisis), total: r(nonfuel + repurchase + rating + crisis) };
}

export interface ValueRow {
  id: string;
  share: number;
  profitCum: number;
  rating: number;
  roiCum: number;
  valueIndex: number;
  rank: number;
}

/** Value share: each segment share weighted by that segment's profit pool ("thị phần theo giá trị"). */
export function valueShare(state: MarketState, p: PlayerState): number {
  let num = 0;
  let den = 0;
  for (const s of SEGMENTS) {
    const m = SEGMENT_MODEL[s];
    const pool = state.sizes[s] * (m.grossProfit + 0.2 * m.nonfuel);
    num += pool * p.shares[s];
    den += pool;
  }
  return den > 0 ? num / den : 0;
}

/** 40% profit, 30% value share, 20% customer satisfaction (stars), 10% marketing ROI. */
export function valueIndex(state: MarketState, order: string[]): Record<string, ValueRow> {
  const total = SEGMENTS.reduce((a, s) => a + state.sizes[s], 0);
  const rows = order.map((id) => {
    const p = state.players[id]!;
    void total;
    const q = Math.max(1, state.quarter);
    const roiCum = p.spendCum > 0 ? (p.gpCum - p.baselineGp * q - p.spendCum) / p.spendCum : 0;
    return { id, share: valueShare(state, p), profitCum: p.profitCum, rating: p.rating, roiCum };
  });
  const maxProfit = Math.max(...rows.map((r) => r.profitCum), 1e-9);
  const maxShare = Math.max(...rows.map((r) => r.share), 1e-9);
  const minRoi = Math.min(...rows.map((r) => r.roiCum));
  const maxRoi = Math.max(...rows.map((r) => r.roiCum));
  const scored = rows.map((r) => ({
    ...r,
    valueIndex:
      Math.round(
        (40 * clamp01(r.profitCum / maxProfit) +
          30 * (r.share / maxShare) +
          20 * clamp01((r.rating - 3) / 2) +
          10 * (maxRoi > minRoi ? (r.roiCum - minRoi) / (maxRoi - minRoi) : 1)) *
          10,
      ) / 10,
  }));
  const sorted = [...scored].sort((a, b) => b.valueIndex - a.valueIndex || b.profitCum - a.profitCum);
  const out: Record<string, ValueRow> = {};
  sorted.forEach((r, i) => (out[r.id] = { ...r, rank: i + 1 }));
  return out;
}

/** Moodle grade 0..100: 70% scorecard + 30% rank in the room. */
export function gradeOf(scorecardTotal: number, rank: number, players: number): number {
  const rankScore = players > 1 ? ((players - rank) / (players - 1)) * 100 : 100;
  return Math.round((0.7 * scorecardTotal + 0.3 * rankScore) * 10) / 10;
}
