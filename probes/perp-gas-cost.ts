// Docs (https://app.testnet.dreamdex.io/docs/developers/perps-testnet, "Get test funds", fetched 2026-10-28):
//   "transactions to perp pools measured on testnet cost between 0.0003 and 0.003 STT each."
// Read-only. Samples blocks spread over the last ~hour on Hideki, takes every tx sent straight to one of
// the 21 perp pools, and prices it from its receipt (gasUsed * effectiveGasPrice). Also prices our own
// 9 live perp txs listed in the README / feedback 13.
//   NETWORK=hideki npx tsx probes/perp-gas-cost.ts
import { createExchange, perpMarkets, shutdown } from "@dreamdex-bot-kit/perp-core";
import { createPublicClient, http } from "viem";
const OURS = [
  "0xef089b3b", "0x346adf26", "0xa4493108", "0x04cf875a", "0x5a9becbe", "0x86333a59", "0x52940249", "0x75d59bce", "0x7a3c5939",
];
const ctx = createExchange({ withSigner: false });
const pc = createPublicClient({ transport: http(ctx.config.rpcUrl) });
const ms = await perpMarkets(ctx.exchange, true, { includeHalted: true });
const pools = new Map(ms.map((m) => [m.info.poolAddress.toLowerCase(), m.info.baseSymbol]));
const head = await pc.getBlockNumber();
const rows: { fee: number; ok: boolean; gas: bigint; gwei: number; sel: string }[] = [];
const STEP = 1500n, SAMPLES = 24; // ~100 ms blocks -> 1500 blocks ~ 2.5 min apart, ~1 h total
for (let k = 0; k < SAMPLES; k++) {
  const b = head - BigInt(k) * STEP;
  const blk = await pc.getBlock({ blockNumber: b, includeTransactions: true });
  let taken = 0;
  for (const t of blk.transactions as any[]) {
    if (!t.to || !pools.has(t.to.toLowerCase()) || taken >= 5) continue;
    const r = await pc.getTransactionReceipt({ hash: t.hash });
    rows.push({ fee: Number(r.gasUsed * r.effectiveGasPrice) / 1e18, ok: r.status === "success", gas: r.gasUsed, gwei: Number(r.effectiveGasPrice) / 1e9, sel: String(t.input).slice(0, 10) });
    taken++;
    if (k === 0 && taken === 1) console.log(`example: block ${b} ${pools.get(t.to.toLowerCase())} ${t.hash} gasUsed ${r.gasUsed} @ ${Number(r.effectiveGasPrice) / 1e9} gwei = ${(Number(r.gasUsed * r.effectiveGasPrice) / 1e18).toFixed(6)} STT`);
  }
}
const q = (a: number[], p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const fees = rows.filter((r) => r.ok).map((r) => r.fee).sort((a, b) => a - b);
const gas = rows.filter((r) => r.ok).map((r) => Number(r.gas)).sort((a, b) => a - b);
console.log(`head ${head}; ${SAMPLES} blocks sampled ${STEP} apart; ${rows.length} pool txs (${fees.length} successful)`);
console.log(`successful pool tx fee STT: min ${fees[0]?.toFixed(6)} p10 ${q(fees, 0.1)?.toFixed(6)} median ${q(fees, 0.5)?.toFixed(6)} p90 ${q(fees, 0.9)?.toFixed(6)} max ${fees.at(-1)?.toFixed(6)}`);
console.log(`gasUsed: min ${gas[0]} median ${q(gas, 0.5)} max ${gas.at(-1)}; gas prices seen (gwei): ${[...new Set(rows.map((r) => r.gwei))].join(", ")}`);
console.log(`inside the documented 0.0003-0.003 STT range: ${fees.filter((f) => f >= 0.0003 && f <= 0.003).length}/${fees.length}`);
const bySel = new Map<string, number[]>(); for (const r of rows) (bySel.get(r.sel) ?? bySel.set(r.sel, []).get(r.sel)!).push(r.fee);
for (const [sel, f] of bySel) { f.sort((a, b) => a - b); console.log(`  selector ${sel}: ${f.length} txs, fee ${f[0].toFixed(6)}..${f.at(-1)!.toFixed(6)} STT`); }
console.log(`\nour own live perp txs (Wallet 1 via linked bot):`);
// full hashes come from the README; prefixes above are only for display
import { readFileSync } from "node:fs";
const all = [...new Set((readFileSync(new URL("../README.md", import.meta.url), "utf8") + readFileSync(new URL("../feedback/13-no-reduce-only-for-perp-orders-close-can-flip.md", import.meta.url), "utf8")).match(/0x[0-9a-f]{64}/g) ?? [])].filter((h) => OURS.some((p) => h.startsWith(p)));
for (const h of all) {
  const r = await pc.getTransactionReceipt({ hash: h as `0x${string}` });
  console.log(`  ${h} -> ${pools.get(String(r.to).toLowerCase()) ?? r.to} gasUsed ${r.gasUsed} @ ${Number(r.effectiveGasPrice) / 1e9} gwei = ${(Number(r.gasUsed * r.effectiveGasPrice) / 1e18).toFixed(6)} STT`);
}
console.log(new Date().toISOString());
await shutdown(ctx);
process.exit(0);
