// Is there any reduce-only protection on a perp "close"? Live, tiny (BTC min size ~10 USDso).
// 1) open long 1x min via IOC  2) send a sell IOC for 2x min (a close sized from a stale read)
// 3) report the resulting position  4) flatten whatever is left.
//   set -a; . ../secrets/bot.env; set +a; NETWORK=hideki OWNER_ADDRESS=0x5b8c... DRY_RUN=false npx tsx probes/overclose-flip.ts
import { createExchange, requireMarket, positionIn, placeFor, alignPrice, ORDER_TYPE, shutdown } from "@dreamdex-bot-kit/perp-core";
const ctx = createExchange({ withSigner: true });
if (!ctx.tradingKey) throw new Error("expects trading-key mode (OWNER_ADDRESS set)");
const key = ctx.tradingKey;
const m = await requireMarket(ctx.exchange, "BTC-PERP", { reload: true });
const min = BigInt(m.info.minQuantity);
const ex = "https://explorer.testnet.somnia.network/tokyo/tx/";
async function ioc(isBid: boolean, quantity: bigint, label: string) {
  const book = await ctx.exchange.fetchOrderBook(m.symbol, 5);
  const touch = isBid ? book.asks[0][0] : book.bids[0][0];
  const raw = BigInt(Math.round(touch * 1e18));
  const price = alignPrice(isBid ? (raw * 10_050n) / 10_000n : (raw * 9_950n) / 10_000n, m.info);
  const r = await placeFor(key, { pool: m.info.poolAddress, isBid, price, quantity, orderType: ORDER_TYPE.MARKET });
  const filled = r.fills.reduce((s, f) => s + f.quantityFilled, 0n);
  console.log(`${label}: ${isBid ? "buy" : "sell"} ${Number(quantity) / 1e8} BTC IOC -> filled ${Number(filled) / 1e8} | ${ex}${r.hash}`);
  return r;
}
const show = async (t: string) => { const p: any = await positionIn(ctx.exchange, m); console.log(`  position after ${t}: ${p ? p.side + " " + p.contracts : "flat"}`); return p; };
try {
  await show("start");
  await ioc(true, min, "1 open long");
  await show("open");
  await ioc(false, 2n * min, "2 'close' sized 2x the position");
  await show("over-sized close");
} finally {
  for (let i = 0; i < 2; i++) {
    const p: any = await positionIn(ctx.exchange, m);
    if (!p) break;
    const q = BigInt(Math.round(Number(p.contracts) * 1e8));
    await ioc(p.side === "short", q, "cleanup");
  }
  await show("cleanup");
  await shutdown(ctx);
}
process.exit(0);
