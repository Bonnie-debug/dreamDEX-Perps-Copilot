// Read-only: getMaxPerpOrderSize for the owner on every market, both sides, plus the stop fee.
import { createExchange, perpMarkets, shutdown } from "@dreamdex-bot-kit/perp-core";
const ctx = createExchange({ withSigner: false });
const ex = ctx.exchange;
const owner = process.env.OWNER_ADDRESS as `0x${string}`;
const ms = await perpMarkets(ex, true, { includeHalted: true });
const j = (o: unknown) => JSON.stringify(o, (k, v) => (typeof v === "bigint" ? v.toString() : v));
for (const m of ms) {
  const i = m.info;
  const mark = BigInt(i.markPrice);
  const tick = BigInt(i.tickSize);
  const px = (mark / tick) * tick;
  let line = `${i.baseSymbol}`;
  for (const isBid of [true, false]) {
    try {
      const r: any = await ex.client.getMaxPerpOrderSize({ pool: i.poolAddress, marginBank: i.marginBank, account: owner, isBid, price: px });
      line += ` | ${isBid ? "long" : "short"}: ${j({ placeable: r.placeable, limitedBy: r.limitedBy, maxQ: r.maxQuantity, maxPos: r.maxPositionSize, imf: r.effectiveImfBps })}`;
    } catch (e) { line += ` | err ${String((e as Error).message).slice(0, 120)}`; }
  }
  try { const fee = await ex.client.getPerpStopOrderSomiPayment(i.stopRegistry); line += ` | stopFee ${Number(fee) / 1e18}`; } catch (e) { line += ` | stopFee err ${String((e as Error).message).slice(0, 80)}`; }
  console.log(line);
}
console.log(new Date().toISOString());
await shutdown(ctx);
process.exit(0);
