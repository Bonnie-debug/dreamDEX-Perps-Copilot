// Docs (https://app.testnet.dreamdex.io/docs/trading/perps-testnet/margin-and-liquidations#paper-usdso and the
// market table on /docs/trading/perps-testnet, fetched 2026-10-28): while paper USDso (the Perps Arena credit
// voucher) remains in the account, "You can open or increase positions only in the markets marked Yes under
// Paper USDso ... The six newest markets are not on that list" (1000PEPE, LIT, PUMP, VVV, ZEC, ZRO = "No").
// This probe: (1) reads MarginBank.isVoucherMarketAllowed(pool) for all 21 markets, (2) reads the account's
// voucher floor, (3) LIVE: opens the minimum ZEC-PERP long (0.009 ZEC, ~12 USDso notional) from that voucher
// account via IOC, then (4) closes it.
//   set -a; . ../secrets/bot.env; set +a; NETWORK=hideki OWNER_ADDRESS=0x5b8c... DRY_RUN=false npx tsx probes/voucher-blocked-market.ts
import { createExchange, perpMarkets, requireMarket, positionIn, placeFor, alignPrice, ORDER_TYPE, shutdown } from "@dreamdex-bot-kit/perp-core";
import { createPublicClient, http, parseAbi } from "viem";
const DOCS_NO = new Set(["1000PEPE", "LIT", "PUMP", "VVV", "ZEC", "ZRO"]);
const abi = parseAbi(["function isVoucherMarketAllowed(address perpPool) view returns (bool)"]);
const ctx = createExchange({ withSigner: true });
if (!ctx.tradingKey) throw new Error("expects trading-key mode (OWNER_ADDRESS set)");
const key = ctx.tradingKey;
const owner = process.env.OWNER_ADDRESS as `0x${string}`;
const pc = createPublicClient({ transport: http(ctx.config.rpcUrl) });
const ex = "https://explorer.testnet.somnia.network/tokyo/tx/";

console.log("1) MarginBank.isVoucherMarketAllowed(pool) vs docs 'Paper USDso' column");
for (const mk of await perpMarkets(ctx.exchange, true, { includeHalted: true })) {
  const v = await pc.readContract({ address: mk.info.marginBank, abi, functionName: "isVoucherMarketAllowed", args: [mk.info.poolAddress] });
  const docs = DOCS_NO.has(mk.info.baseSymbol) ? "No" : "Yes";
  console.log(`  ${mk.info.baseSymbol}: chain ${v} | docs ${docs}${(v === true) !== (docs === "Yes") ? "  <-- MISMATCH" : ""}`);
}
const m = await requireMarket(ctx.exchange, "ZEC-PERP", { reload: true });
const vch = await ctx.exchange.client.getPerpVoucher(m.info.marginBank, owner);
console.log(`\n2) voucher on ${owner}: claimed=${vch?.claimed} floor=${Number(vch?.floor ?? 0n) / 1e18} USDso expiresAt=${vch?.expiresAt} (non-zero floor = paper USDso still in the account)`);

const min = BigInt(m.info.minQuantity);
async function ioc(isBid: boolean, quantity: bigint, label: string) {
  const book = await ctx.exchange.fetchOrderBook(m.symbol, 5);
  const touch = isBid ? book.asks[0][0] : book.bids[0][0];
  const raw = BigInt(Math.round(touch * 1e18));
  const price = alignPrice(isBid ? (raw * 10_050n) / 10_000n : (raw * 9_950n) / 10_000n, m.info);
  const r = await placeFor(key, { pool: m.info.poolAddress, isBid, price, quantity, orderType: ORDER_TYPE.MARKET });
  const filled = r.fills.reduce((s, f) => s + f.quantityFilled, 0n);
  console.log(`  ${label}: ${isBid ? "buy" : "sell"} ${Number(quantity) / 1e8} ZEC IOC @<=${Number(price) / 1e18} -> filled ${Number(filled) / 1e8} | ${ex}${r.hash}`);
  return r;
}
const show = async (t: string) => { const p: any = await positionIn(ctx.exchange, m); console.log(`  position after ${t}: ${p ? p.side + " " + p.contracts : "flat"}`); return p; };
try {
  console.log("\n3) open the minimum ZEC-PERP long from the voucher account (docs: should be rejected)");
  await show("start");
  try { await ioc(true, min, "open long"); } catch (e) { console.log("  open REJECTED:", String((e as Error).message).split("\n")[0].slice(0, 300)); }
  await show("open");
} finally {
  console.log("\n4) cleanup");
  for (let i = 0; i < 2; i++) {
    const p: any = await positionIn(ctx.exchange, m);
    if (!p) break;
    await ioc(p.side === "short", BigInt(Math.round(Number(p.contracts) * 1e8)), "close");
  }
  await show("cleanup");
  const after = await ctx.exchange.client.getPerpVoucher(m.info.marginBank, owner);
  console.log(`  voucher floor after: ${Number(after?.floor ?? 0n) / 1e18} USDso`);
  console.log(new Date().toISOString());
  await shutdown(ctx);
}
process.exit(0);
