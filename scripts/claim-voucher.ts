// Claim the one-time 1,000 paper USDso perps credit for this key's own perps account.
import { createExchange, perpMarkets, shutdown } from "@dreamdex-bot-kit/perp-core";

const ctx = createExchange({ withSigner: true });
try {
  const [m] = await perpMarkets(ctx.exchange);
  const me = ctx.exchange.walletAddress as `0x${string}`;
  const e = await ctx.exchange.client.getPerpVoucherEligibility(m!.info.marginBank, me);
  console.log("eligibility", e);
  if (e.eligible && !process.argv.includes("--dry")) {
    const res = await ctx.exchange.trader.claimPerpVoucher({ marginBank: m!.info.marginBank });
    console.log("claimed", (res as { hash?: string }).hash);
  }
} finally {
  await shutdown(ctx);
}
process.exit(0);
