# Developer docs say a perp-pool transaction costs 0.0003–0.003 STT; a single order costs 0.009–0.026 STT (up to ~9x the top of the range)

Severity: minor
Area: docs (Perps on Testnet for Developers › Get test funds)

## Steps to reproduce
1. Docs: https://app.testnet.dreamdex.io/docs/developers/perps-testnet, "Get test funds": "Gas is billed on what a transaction uses, not on its gas limit: transactions to perp pools measured on testnet cost between 0.0003 and 0.003 STT each."
2. Run `NETWORK=hideki npx tsx probes/perp-gas-cost.ts` (read-only). Script: [probes/perp-gas-cost.ts](../probes/perp-gas-cost.ts). It samples 24 blocks spread over the last ~hour, prices every transaction sent straight to one of the 21 perp pools from its receipt (`gasUsed × effectiveGasPrice`), groups them by function selector, and also prices our own 9 live perp order transactions.

## Expected
Perp-pool transactions, and at least a plain order, cost 0.0003–0.003 STT, so a bot can budget gas from the docs.

## Actual
The range only holds for cancels and batch calls. A single order costs far more:

```
head 35217874; 24 blocks sampled 1500 apart; 37 pool txs (35 successful)
successful pool tx fee STT: min 0.000228 p10 0.000729 median 0.001410 p90 0.020245 max 0.021754
gasUsed: min 124056 median 923398 max 3625592; gas prices seen (gwei): 0.6, 6, 1.8
inside the documented 0.0003-0.003 STT range: 20/35
  selector 0x4e978373 placeOrder(...):      9 txs, fee 0.014212..0.021754 STT
  selector 0x80054449 (perp order for an account): 6 txs, fee 0.003517..0.008808 STT
  selector 0x0dce6933 cancelOrders(uint128[]): 11 txs, fee 0.000228..0.001496 STT
  selector 0x24ea3d1f placeOrders(tuple[]):  7 txs, fee 0.000792..0.001895 STT

our own live perp txs (Wallet 1 via linked bot, all 6 gwei = the block base fee):
  0xef089b3b… BTC open  gasUsed 4312530 = 0.025875 STT
  0x346adf26… BTC close gasUsed 2733584 = 0.016402 STT
  0xa4493108… ETH open  gasUsed 2513955 = 0.015084 STT
  ... all 9 between 0.009466 and 0.025875 STT, none inside 0.0003–0.003
```

The base fee on Hideki read 6 gwei (`eth_gasPrice` 6 gwei, `maxPriorityFeePerGas` 0). At 6 gwei, 0.003 STT buys 500k gas, but a filled order uses 1.5M–4.3M gas. A builder who funds a bot from the docs ("0.003 STT each") will run out of gas about 5–9x sooner than planned. That matters more because the only STT source for Hideki is the app's "Send it … for gas".

## Suggested fix
State the cost per action, for example "a cancel or batch ~0.0003–0.002 STT; a single order that fills ~0.01–0.026 STT at the 6 gwei base fee". Or give the gas units and point to `eth_gasPrice`.

## Evidence
Full output: [probes/perp-gas-cost.out](../probes/perp-gas-cost.out), 2026-10-28 ~11:09 EAT (08:09 UTC). Our order txs, all status success, on https://explorer.testnet.somnia.network/tokyo/tx/<hash>. Full hashes are in the README "Testnet evidence" and in feedback 13.

## Environment
@somnia-chain/markets-sdk 0.32.1, viem 2.x, Node 22. Somnia Tokyo testnet (Hideki, chain 50383), RPC https://api.hideki2.infra.testnet.somnia.network. Read-only.
