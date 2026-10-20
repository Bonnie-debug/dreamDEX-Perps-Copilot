// dreamDEX Perps Copilot for dreamDEX.
//
//   npm start -w perp-copilot -- plan  "long eth 40 usdso 3x tp 2% sl 1%"
//   npm start -w perp-copilot -- trade "short sol 25 usdso 2x tp 3 sl 1.5"
//   npm start -w perp-copilot -- journal
//
// plan   parses the idea, runs the live risk check, prints a verdict. Sends nothing.
// trade  does the same, and if the verdict is not BLOCK and DRY_RUN=false,
//        opens the position with an IOC, protects it with a take-profit and a
//        stop-loss, and writes every step to the journal with its tx hash.
// journal prints the trade log and a shareable trade card for the last trade.

import {
  ORDER_TYPE,
  alignPrice,
  armBracket,
  closePosition,
  createExchange,
  liveMark,
  onStop,
  perpMarkets,
  placeFor,
  positionIn,
  requireMarket,
  shutdown,
  sleep,
  tradingKeyCheck,
  type PerpContext,
  type PerpMarket,
} from "@dreamdex-bot-kit/perp-core";
import { formatUnits } from "viem";
import { resolveIntent, type TradeIntent } from "./intent.js";
import { assess, explain } from "./risk.js";
import { appendJournal, lastTrade, printJournal, tradeCard, txUrl } from "./journal.js";

const SLIPPAGE_BPS = Number(process.env.COPILOT_SLIPPAGE_BPS ?? 30);
const TICK_MS = Number(process.env.COPILOT_TICK_MS ?? 10_000);
const WATCH_MAX_MIN = Number(process.env.COPILOT_WATCH_MAX_MIN ?? 120);

async function openIoc(ctx: PerpContext, market: PerpMarket, intent: TradeIntent, touch: number, quantity: bigint) {
  const slip = BigInt(SLIPPAGE_BPS);
  const raw = BigInt(Math.round(touch * 1e18));
  const price = alignPrice(intent.side === "long" ? (raw * (10_000n + slip)) / 10_000n : (raw * (10_000n - slip)) / 10_000n, market.info);
  const order = { pool: market.info.poolAddress, isBid: intent.side === "long", price, quantity, orderType: ORDER_TYPE.MARKET };
  const res = ctx.tradingKey ? await placeFor(ctx.tradingKey, order) : await ctx.exchange.trader.placePerpOrder(order);
  const r = res as { hash?: `0x${string}`; orderId?: bigint; fills?: { quantityFilled: bigint }[]; receipt?: { status?: string } };
  const filled = (r.fills ?? []).reduce((s, f) => s + f.quantityFilled, 0n);
  return { hash: r.hash, orderId: r.orderId, filled, price: Number(formatUnits(price, 18)) };
}

async function main() {
  const [cmd = "plan", ...rest] = process.argv.slice(2);
  const text = rest.join(" ").trim();

  if (cmd === "journal") {
    printJournal();
    const last = lastTrade();
    if (last) console.log("\n--- trade card ---\n" + tradeCard(last));
    return;
  }

  const live = (cmd === "trade" || cmd === "close") && process.env.DRY_RUN === "false";
  const ctx = createExchange({ withSigner: live });
  try {
    const markets = await perpMarkets(ctx.exchange);
    const bases = markets.map((m) => m.info.baseSymbol.toUpperCase());

    if (cmd === "markets") {
      console.log(bases.join(" "));
      return;
    }
    if (cmd === "close") {
      // Close the whole position on one market with an IOC priced through the
      // touch, and keep the transaction hash (closePosition() does not return it).
      const sym = (text || "BTC").toUpperCase();
      const market = await requireMarket(ctx.exchange, sym.endsWith("-PERP") ? sym : `${sym}-PERP`);
      const account = ctx.exchange.walletAddress as `0x${string}`;
      const pos = await positionIn(ctx.exchange, market);
      if (!pos) { console.log(`no open position on ${market.symbol}`); return; }
      const preview = await ctx.exchange.client.previewPerpClosePnl({ pool: market.info.poolAddress, marginBank: market.info.marginBank, account });
      if (!preview.priceable || preview.closedQuantity <= 0n) { console.log("nothing closeable right now"); return; }
      const book = await ctx.exchange.fetchOrderBook(market.symbol, 5);
      const closeSide: "long" | "short" = pos.side === "long" ? "short" : "long";
      const touch = closeSide === "long" ? book.asks[0]?.[0] : book.bids[0]?.[0];
      if (touch === undefined) { console.log("no resting liquidity to close against"); return; }
      if (process.env.DRY_RUN !== "false") { console.log(`[dry-run] would close ${pos.side} ${pos.contracts} on ${market.symbol}`); return; }
      const intent = { side: closeSide, symbol: market.symbol } as unknown as TradeIntent;
      const res = await openIoc(ctx, market, intent, touch, preview.closedQuantity);
      const m = await liveMark(ctx.exchange, market);
      console.log(`closed: filled ${formatUnits(res.filled, market.info.baseDecimals)} ${market.info.baseSymbol} | tx ${txUrl(res.hash)}`);
      appendJournal({ kind: "close", at: new Date().toISOString(), intent, reason: "manual", tx: res.hash, exitMark: m, pnlUsdso: pos.unrealizedPnl });
      return;
    }
    if (!text) throw new Error('give a trade idea, e.g. plan "long eth 40 usdso 3x tp 2% sl 1%"');

    const { intent, problems } = await resolveIntent(text, bases);
    if (!intent) {
      console.log(`could not read that trade: ${problems.join("; ")}`);
      return;
    }
    const market = await requireMarket(ctx.exchange, intent.symbol);
    const account = ctx.exchange.walletAddress as `0x${string}` | undefined;
    if (account && ctx.tradingKey) {
      const link = await tradingKeyCheck(ctx, market);
      if (link.message) console.log(link.message);
    }

    const report = await assess(ctx, market, intent, account);
    console.log(explain(intent, market, report));
    appendJournal({ kind: "plan", at: new Date().toISOString(), intent, verdict: report.verdict, reasons: report.reasons, mark: report.mark });

    if (cmd !== "trade") return;
    if (report.verdict === "BLOCK") {
      console.log("\nnot trading: the risk check blocked it.");
      return;
    }
    if (!live) {
      console.log("\n[dry-run] would open this position. Set DRY_RUN=false to send it.");
      return;
    }
    if (!account || report.touchPrice === undefined || !report.quantity) return;

    const opened = await openIoc(ctx, market, intent, report.touchPrice, report.quantity);
    const entry = (await liveMark(ctx.exchange, market)) ?? report.mark!;
    console.log(`opened: filled ${formatUnits(opened.filled, market.info.baseDecimals)} ${market.info.baseSymbol} | tx ${txUrl(opened.hash)}`);
    appendJournal({
      kind: "open", at: new Date().toISOString(), intent, tx: opened.hash, orderId: opened.orderId?.toString(),
      filled: formatUnits(opened.filled, market.info.baseDecimals), entryMark: entry,
    });
    if (opened.filled === 0n) {
      console.log("nothing crossed; the book moved. No position was opened.");
      return;
    }

    const up = entry * (1 + intent.takeProfitPct / 100);
    const down = entry * (1 - intent.stopLossPct / 100);
    const tp = intent.side === "long" ? up : down;
    const sl = intent.side === "long" ? down : up;

    if (!ctx.tradingKey) {
      // Own account: the exchange holds the exits, even if this process dies.
      const b = await armBracket({ ctx, market, position: intent.side, takeProfit: BigInt(Math.round(tp * 1e18)), stopLoss: BigInt(Math.round(sl * 1e18)) });
      appendJournal({ kind: "bracket", at: new Date().toISOString(), intent, tp, sl, armed: b.sent });
      console.log(`exits armed on the stop registry: tp ${tp.toPrecision(6)} sl ${sl.toPrecision(6)}`);
      return;
    }

    // Linked trading key: only the account can arm stops, so the copilot
    // watches the mark and closes the position itself.
    console.log(`watching exits: tp ${tp.toPrecision(6)} sl ${sl.toPrecision(6)} (for up to ${WATCH_MAX_MIN} min)`);
    const stopped = onStop();
    const until = Date.now() + WATCH_MAX_MIN * 60_000;
    while (!stopped() && Date.now() < until) {
      await sleep(TICK_MS, stopped);
      const fresh = await requireMarket(ctx.exchange, market.symbol, { reload: true });
      const pos = await positionIn(ctx.exchange, fresh);
      if (!pos) { console.log("position is closed"); break; }
      const m = await liveMark(ctx.exchange, fresh);
      if (m === undefined) continue;
      const hitTp = intent.side === "long" ? m >= tp : m <= tp;
      const hitSl = intent.side === "long" ? m <= sl : m >= sl;
      console.log(`${pos.side} ${pos.contracts} | mark ${m} | uPnL ${pos.unrealizedPnl?.toFixed(4) ?? "?"}`);
      if (hitTp || hitSl) {
        const label = hitTp ? "take-profit" : "stop-loss";
        await closePosition(ctx, fresh, account, { label });
        appendJournal({ kind: "close", at: new Date().toISOString(), intent, reason: label, exitMark: m, pnlUsdso: pos.unrealizedPnl });
        break;
      }
    }
    if (Date.now() >= until) {
      await closePosition(ctx, market, account, { label: "time-out" });
      appendJournal({ kind: "close", at: new Date().toISOString(), intent, reason: "time-out" });
    }
  } finally {
    await shutdown(ctx);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
