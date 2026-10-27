// The bot kit's createExchange() hands the SDK the SHANNON address set
// (SOMNIA_TESTNET_ADDRESSES) even when NETWORK=hideki. Compare it with the
// SDK built the way the dreamDEX developer docs say (SOMNIA_HIDEKI_TESTNET_ADDRESSES).
// Read-only. NETWORK=hideki npx tsx probes/kit-shannon-addresses.ts
import { createExchange, shutdown } from "@dreamdex-bot-kit/perp-core";
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES as H, SOMNIA_TESTNET_ADDRESSES as T } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { createPublicClient, http } from "viem";

const rpc = "https://api.hideki2.infra.testnet.somnia.network";
const pc = createPublicClient({ transport: http(rpc) });
for (const k of ["perpPoolFactory", "marginBank", "collateral", "priceFeedScheduler", "marketCreator"] as const) {
  const code = await pc.getCode({ address: (T as any)[k] });
  console.log(`kit passes ${k}=${(T as any)[k]} (Shannon) | Hideki has ${(H as any)[k]} | bytecode at the Shannon address on chain 50383: ${code && code !== "0x" ? code.length / 2 - 1 + " bytes" : "NONE"}`);
}

async function report(label: string, ex: SomniaMarkets) {
  const ms = await ex.loadMarkets(true);
  const perps = Object.values(ms).filter((m) => m.type === "swap");
  const e: any = ex;
  console.log(`\n[${label}] perps=${perps.length} active=${perps.filter((m) => m.active).length} with chain perpStatus (restricted/registered gates)=${perps.filter((m: any) => m.perpStatus).length}`);
  const b: any = perps.find((m) => m.base === "BTC");
  console.log(`  BTC: active=${b?.active} perpStatus=${JSON.stringify(b?.perpStatus ?? null)}`);
  console.log(`  perpDiscoveryError: ${e.perpDiscoveryError ? String(e.perpDiscoveryError.message ?? e.perpDiscoveryError).slice(0, 300) : "null"}`);
  console.log(`  perpDiscoverySkipped: ${JSON.stringify(e.perpDiscoverySkipped ?? null)}`);
  console.log(`  registryReadError: ${e.registryReadError ? String(e.registryReadError.message ?? e.registryReadError).slice(0, 200) : "null"}`);
}

const kit = createExchange({ withSigner: false });
await report("bot kit createExchange (NETWORK=hideki)", kit.exchange);
const docs = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql", addresses: H });
await report("SDK per dreamDEX docs (SOMNIA_HIDEKI_TESTNET_ADDRESSES)", docs);
console.log("\n" + new Date().toISOString());
await shutdown(kit);
await (docs as any).close?.();
process.exit(0);
