// The pre-trade risk check. Every number here is read live from the pool,
// the order book or the margin bank; nothing is a cached guess. Where a value
// is an estimate (liquidation distance), the report says so.

import {
  liveFunding,
  liveMark,
  markAgeSec,
  marginSnapshot,
  sizeForNotional,
  sizeOrder,
  type PerpContext,
  type PerpMarket,
} from "@dreamdex-bot-kit/perp-core";
import { formatUnits } from "viem";
import type { TradeIntent } from "./intent.js";

export type Verdict = "GO" | "CAUTION" | "BLOCK";

export interface RiskReport {
  verdict: Verdict;
  reasons: string[];
  mark?: number;
  markAgeSec: number;
  bestBid?: number;
  bestAsk?: number;
  spreadBps?: number;
  fundingAprPct?: number;
  fundingYouPay?: boolean;
  fundingPerDayUsdso?: number;
  initialMarginBps: number;
  marginNeededUsdso: number;
  equityUsdso?: number;
  liqDistancePctEstimate: number;
  rewardToRisk: number;
  quantity?: bigint;
  quantityHuman?: string;
  limitedBy?: string;
  touchPrice?: number;
}

const MAX_SPREAD_BPS = Number(process.env.COPILOT_MAX_SPREAD_BPS ?? 30);
const MAX_MARK_AGE_SEC = Number(process.env.COPILOT_MAX_MARK_AGE_SEC ?? 120);
const MAX_FUNDING_APR_PCT = Number(process.env.COPILOT_MAX_FUNDING_APR_PCT ?? 50);

export async function assess(ctx: PerpContext, market: PerpMarket, intent: TradeIntent, account?: `0x${string}`): Promise<RiskReport> {
  const reasons: string[] = [];
  let verdict: Verdict = "GO";
  const bump = (v: Verdict, why: string) => {
    reasons.push(`${v === "BLOCK" ? "BLOCK" : v === "CAUTION" ? "caution" : "ok"}: ${why}`);
    if (v === "BLOCK" || (v === "CAUTION" && verdict === "GO")) verdict = v;
  };

  const mark = await liveMark(ctx.exchange, market);
  const age = markAgeSec(market.info as never);
  if (mark === undefined) bump("BLOCK", "the market is un-priceable right now (no live mark)");
  // The indexed row lags the pool by design, so its age only matters when the
  // pool itself cannot price the market.
  if (mark === undefined && Number.isFinite(age) && age > MAX_MARK_AGE_SEC) reasons.push(`note: last indexed mark is ${Math.round(age)}s old`);

  const book = await ctx.exchange.fetchOrderBook(market.symbol, 5);
  const bestBid = book.bids[0]?.[0];
  const bestAsk = book.asks[0]?.[0];
  let spreadBps: number | undefined;
  if (bestBid !== undefined && bestAsk !== undefined) {
    spreadBps = ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 10_000;
    if (spreadBps > MAX_SPREAD_BPS) bump("CAUTION", `spread is ${spreadBps.toFixed(1)} bps, wider than ${MAX_SPREAD_BPS}`);
  }
  const MAX_MARK_GAP_BPS = Number(process.env.COPILOT_MAX_MARK_GAP_BPS ?? 15);
  if (mark !== undefined && bestBid !== undefined && bestAsk !== undefined) {
    const gap = (((bestBid + bestAsk) / 2 - mark) / mark) * 10_000;
    if (Math.abs(gap) > MAX_MARK_GAP_BPS) {
      bump("CAUTION", `the book trades ${Math.abs(gap).toFixed(1)} bps ${gap > 0 ? "above" : "below"} the mark; PnL and liquidation follow the mark`);
    }
  }
  const touch = intent.side === "long" ? bestAsk : bestBid;
  if (touch === undefined) bump("BLOCK", `no ${intent.side === "long" ? "asks" : "bids"} resting to trade against`);

  // Funding: positive rate means longs pay shorts.
  const f = await liveFunding(ctx.exchange, market);
  let fundingAprPct: number | undefined;
  let fundingYouPay: boolean | undefined;
  let fundingPerDayUsdso: number | undefined;
  if (f.known) {
    fundingAprPct = f.apr * 100;
    fundingYouPay = f.paidSide !== intent.side;
    fundingPerDayUsdso = (intent.notionalUsdso * Math.abs(f.apr)) / 365;
    if (fundingYouPay && Math.abs(fundingAprPct) > MAX_FUNDING_APR_PCT) {
      bump("CAUTION", `you pay ${Math.abs(fundingAprPct).toFixed(1)}% APR funding holding this ${intent.side}`);
    }
  }

  // Margin. The lever is a floor: the pool's initial margin wins if higher.
  const imBps = Number(market.info.initialMarginBps);
  const effectiveImFrac = Math.max(imBps / 10_000, 1 / intent.leverage);
  const marginNeededUsdso = intent.notionalUsdso * effectiveImFrac;
  if (1 / intent.leverage < imBps / 10_000) {
    bump("CAUTION", `${intent.leverage}x is above this market's max (${(10_000 / imBps).toFixed(0)}x); margin follows the market's ${imBps} bps`);
  }

  // Liquidation distance, ESTIMATED: initial margin fraction minus an assumed
  // maintenance fraction of half the initial requirement. The pool's real
  // number depends on the whole cross-margin account, so this is a guard rail,
  // not a promise.
  const liqDistancePctEstimate = (effectiveImFrac - imBps / 20_000) * 100;
  if (intent.stopLossPct >= liqDistancePctEstimate) {
    bump("BLOCK", `stop-loss ${intent.stopLossPct}% sits beyond the ~${liqDistancePctEstimate.toFixed(2)}% liquidation distance`);
  }
  const rewardToRisk = intent.takeProfitPct / intent.stopLossPct;
  if (rewardToRisk < 1) bump("CAUTION", `reward to risk is ${rewardToRisk.toFixed(2)}, below 1`);

  let equityUsdso: number | undefined;
  let quantity: bigint | undefined;
  let quantityHuman: string | undefined;
  let limitedBy: string | undefined;
  const wanted = mark !== undefined ? sizeForNotional(intent.notionalUsdso, market.info, mark) : 0n;
  quantity = wanted;
  quantityHuman = formatUnits(wanted, market.info.baseDecimals);
  if (wanted === 0n && mark !== undefined) bump("BLOCK", `size rounds below the market minimum`);

  if (account && touch !== undefined) {
    const snap = await marginSnapshot(ctx.exchange, market, account);
    equityUsdso = Number(formatUnits(snap.equity, 18));
    if (equityUsdso < marginNeededUsdso) {
      bump("BLOCK", `needs ~${marginNeededUsdso.toFixed(2)} USDso margin, the perps account holds ${equityUsdso.toFixed(2)}`);
    }
    const sized = await sizeOrder(ctx.exchange, {
      market,
      account,
      side: intent.side,
      price: BigInt(Math.round(touch * 1e18)),
      wanted,
      tradingKey: ctx.tradingKey,
    });
    limitedBy = sized.limitedBy;
    if (!sized.ok) bump("BLOCK", sized.reason ?? "the pool will not accept this size");
    else {
      if (sized.quantity < wanted) bump("CAUTION", `the pool caps this order below the size you asked for (${sized.limitedBy})`);
      quantity = sized.quantity;
      quantityHuman = formatUnits(sized.quantity, market.info.baseDecimals);
    }
  } else if (!account) {
    reasons.push("note: no wallet loaded, so account margin and pool size limits were not checked");
  }

  if (reasons.length === 0) reasons.push("ok: every check passed");
  return {
    verdict, reasons, mark, markAgeSec: age, bestBid, bestAsk, spreadBps, fundingAprPct, fundingYouPay,
    fundingPerDayUsdso, initialMarginBps: imBps, marginNeededUsdso, equityUsdso, liqDistancePctEstimate,
    rewardToRisk, quantity, quantityHuman, limitedBy, touchPrice: touch,
  };
}

export function explain(intent: TradeIntent, market: PerpMarket, r: RiskReport): string {
  const px = (v?: number) => (v === undefined ? "n/a" : v >= 100 ? v.toFixed(2) : v.toPrecision(5));
  const lines = [
    `${intent.side.toUpperCase()} ${intent.notionalUsdso} USDso of ${market.display} at ${intent.leverage}x  (parsed by ${intent.source})`,
    `size        ${r.quantityHuman ?? "?"} ${market.info.baseSymbol} at mark ${px(r.mark)}  | book ${px(r.bestBid)} / ${px(r.bestAsk)}` +
      (r.spreadBps !== undefined ? `  (${r.spreadBps.toFixed(1)} bps spread)` : ""),
    `margin      ~${r.marginNeededUsdso.toFixed(2)} USDso needed` + (r.equityUsdso !== undefined ? `, account equity ${r.equityUsdso.toFixed(2)}` : ""),
    `exits       take-profit +${intent.takeProfitPct}%  stop-loss -${intent.stopLossPct}%  | reward:risk ${r.rewardToRisk.toFixed(2)}`,
    `liquidation ~${r.liqDistancePctEstimate.toFixed(2)}% away (estimate)`,
    r.fundingAprPct !== undefined
      ? `funding     ${r.fundingAprPct.toFixed(2)}% APR, you ${r.fundingYouPay ? "PAY" : "RECEIVE"} about ${r.fundingPerDayUsdso!.toFixed(4)} USDso a day`
      : "funding     unreadable",
    ...r.reasons.map((x) => `  - ${x}`),
    `VERDICT     ${r.verdict}`,
  ];
  return lines.join("\n");
}
