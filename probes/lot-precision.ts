// Feedback 10: UnifiedMarket.precision.amount cannot describe a lot step > 1.
// Read-only + eth_call simulations (no transaction is sent).
//   NETWORK=hideki OWNER_ADDRESS=0x... [PRIVATE_KEY for the simulation part] npx tsx probes/lot-precision.ts
import { createExchange, perpMarkets, shutdown, ORDER_TYPE } from "@dreamdex-bot-kit/perp-core";
import { contractErrorsAbi } from "@somnia-chain/markets-sdk";
import { parseAbi, parseUnits, createPublicClient, http } from "viem";

const ctx = createExchange({ withSigner: false });
const ms = await perpMarkets(ctx.exchange, true, { includeHalted: true });

console.log("market | baseDecimals | lotSize (raw) | lot step (human) | precision.amount | step implied by precision (10^-p) | limits.amount | consistent?");
let bad = 0;
for (const m of ms) {
  const i = m.info;
  const lot = Number(BigInt(i.lotSize)) / 10 ** i.baseDecimals;
  const p = m.market.precision.amount as number;
  const implied = 10 ** -p;
  const ok = Math.abs(lot - implied) < 1e-12 * Math.max(1, lot);
  if (!ok) bad++;
  console.log(`${i.baseSymbol} | ${i.baseDecimals} | ${i.lotSize} | ${lot} | ${p} | ${implied} | ${JSON.stringify(m.market.limits.amount)} | ${ok ? "yes" : "NO  <-- precision says step " + implied + ", pool step is " + lot}`);
}
console.log(`\n${bad}/${ms.length} markets: precision.amount does not describe the lot step, and no field on UnifiedMarket (precision/limits) carries it.`);

// What a ccxt-style client does with that metadata on PUMP.
const pump = ms.find((m) => m.info.baseSymbol === "PUMP")!;
const ex = ctx.exchange;
const min = pump.market.limits.amount!.min!;
const step = 10 ** -(pump.market.precision.amount as number);
const ccxtSize = min + 5 * step; // "minimum plus a few steps" on the advertised grid
console.log(`\nPUMP: limits.amount.min=${min}, precision.amount=${pump.market.precision.amount} -> step ${step}`);
for (const a of [ccxtSize, 1850, 1899, 1801, 99, 5.15]) {
  let out: string;
  try { out = String(ex.amountToPrecision(pump.symbol, a)); } catch (e) { out = "throws " + String((e as Error).message).slice(0, 120); }
  console.log(`  amountToPrecision(PUMP, ${a}) -> ${out}`);
}

// Does the pool reject a quantity that is on the advertised grid but off the real lot grid?
// eth_call only (simulateContract), a resting LIMIT bid at ~50% of mark, so nothing could fill even if sent.
const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const owner = process.env.OWNER_ADDRESS as `0x${string}` | undefined;
if (pk && owner) {
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(pk);
  const pc = createPublicClient({ transport: http(ctx.config.rpcUrl) });
  const abi = [
    ...parseAbi([
      "function placeOrderFor(address owner, bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable returns (bool success, uint128 orderId)",
    ]),
    ...contractErrorsAbi,
  ] as const;
  const tick = BigInt(pump.info.tickSize);
  const price = ((BigInt(pump.info.markPrice) / 2n) / tick) * tick;
  const exp = BigInt(Math.floor(Date.now() / 1000) + 3600) * 1_000_000_000n;
  for (const human of ["1800", "1850", "1801"]) {
    const q = parseUnits(human, pump.info.baseDecimals);
    try {
      const r = await pc.simulateContract({
        address: pump.info.poolAddress, abi, functionName: "placeOrderFor", account, gas: 10_000_000n,
        args: [owner, true, 0n, price, q, exp, ORDER_TYPE.LIMIT, 0, "0x0000000000000000000000000000000000000000", 0n],
      });
      console.log(`  simulate placeOrderFor PUMP qty ${human} (raw ${q}) @ ${Number(price) / 1e18}: OK ->`, (r.result as any)?.toString?.() ?? r.result);
    } catch (e: any) {
      const name = e?.cause?.data?.errorName ?? e?.cause?.reason ?? e?.shortMessage;
      console.log(`  simulate placeOrderFor PUMP qty ${human} (raw ${q}) @ ${Number(price) / 1e18}: REVERT ${name} ${e?.cause?.data?.args ? JSON.stringify(e.cause.data.args, (k, v) => typeof v === "bigint" ? v.toString() : v) : ""}`);
    }
  }
}
console.log("\n" + new Date().toISOString());
await shutdown(ctx);
process.exit(0);
