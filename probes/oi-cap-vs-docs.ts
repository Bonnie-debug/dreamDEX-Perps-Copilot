// Read-only: on-chain getPerpPoolParameters() per market vs the dreamDEX docs market table
// (https://app.testnet.dreamdex.io/docs/trading/perps-testnet#markets, fetched 2026-10-27):
// "Open interest cap ... A single account is capped at a tenth of it on most markets."
import { createExchange, perpMarkets, shutdown } from "@dreamdex-bot-kit/perp-core";
import { createPublicClient, http, parseAbi } from "viem";
const DOCS_OI_CAP: Record<string, number> = { BTC: 246.81545, ETH: 3995.6125, HYPE: 23812.72, SOL: 47654.44, XRP: 344632, ADA: 2254678, AVAX: 66672.2, BNB: 693.975, DOGE: 5613590, LINK: 42643.6, NEAR: 250410, SUI: 635009, XLM: 2677780, "1000PEPE": 130285600, LIT: 138896.6, PUMP: 87993700, TAO: 2185.491, VVV: 21786.14, WLD: 1264000, ZEC: 420, ZRO: 250599.5 };
const abi = parseAbi(["function getPerpPoolParameters() view returns ((uint256 initialMarginBps, uint256 maintenanceMarginBps, uint256 closeOutMarginBps, uint256 maxOpenInterest, uint256 maxPositionSize, uint256 takerFeeBpsTimes1k, int256 makerFeeBpsTimes1k, uint256 insuranceFundShareBps))"]);
const ctx = createExchange({ withSigner: false });
const pc = createPublicClient({ transport: http(ctx.config.rpcUrl) });
const block = await pc.getBlockNumber();
const ms = await perpMarkets(ctx.exchange, true, { includeHalted: true });
console.log(`block ${block}\nmarket | docs OI cap | chain maxOpenInterest | chain maxPositionSize | per-account cap as % of chain OI cap | docs 'a tenth'?`);
let off = 0;
for (const m of ms) {
  const i = m.info;
  const p: any = await pc.readContract({ address: i.poolAddress, abi, functionName: "getPerpPoolParameters", blockNumber: block });
  const d = 10 ** i.baseDecimals;
  const oi = Number(p.maxOpenInterest) / d, pos = Number(p.maxPositionSize) / d;
  const pct = (100 * pos) / oi;
  const tenth = Math.abs(pct - 10) < 0.05;
  if (!tenth) off++;
  console.log(`${i.baseSymbol} | ${DOCS_OI_CAP[i.baseSymbol]} | ${oi} | ${pos} | ${pct.toFixed(2)}% | ${tenth ? "yes" : "NO"}${Math.abs(oi - DOCS_OI_CAP[i.baseSymbol]) / oi > 0.001 ? " | docs OI cap differs from chain" : ""}`);
}
console.log(`\n${off}/${ms.length} markets: per-account cap is not a tenth of the OI cap. ${new Date().toISOString()}`);
await shutdown(ctx);
process.exit(0);
