# Docs promise reduce-only perp orders, but the SDK and the pool ABI have no reduce-only flag, so an oversized "close" flips the position (tx evidence)

Severity: normal
Area: SDK / contracts (perp orders) / bot kit (closePosition) / docs

## Steps to reproduce
1. Docs: https://app.testnet.dreamdex.io/docs/trading/perps-testnet/orders: "**Reduce-only** orders can only shrink a position, never open or flip one."
2. Look for a way to send one from code:
   - `ORDER_TYPE` in markets-sdk 0.32.1 (dist/trade.d.ts line 380) is LIMIT 0, FILL_OR_KILL 1, MARKET 2, POST_ONLY 3. There is no reduce-only.
   - `PlacePerpOrderParams` has no reduce-only field. The only "reduce-only" in the SDK is the stop registry's trigger mode (dist/trade.d.ts ~1449, tradeAbi.js line 290).
   - Contract docs: `placeOrder`/`placeOrderFor` and the `OrderType` enum (NormalOrder, FillOrKill, ImmediateOrCancel, PostOnly) have no reduce-only argument either (https://app.testnet.dreamdex.io/docs/developers/contracts/types, /functions).
3. Run the live repro with tiny size: `NETWORK=hideki OWNER_ADDRESS=<linked account> DRY_RUN=false npx tsx probes/overclose-flip.ts` (bot key in PRIVATE_KEY). Script: [probes/overclose-flip.ts](../probes/overclose-flip.ts). It opens a minimum BTC long, then sends a sell IOC for twice the position, as a close sized from a stale read would. It then flattens.

## Expected
Some way to mark a perp order as reducing (a flag, or an order type), so a close can never open the other side. That is what the app docs describe, and it is standard on perp venues. Failing that, the docs should say plainly that API orders are never reduce-only.

## Actual
The oversized close fills in full and opens a short of the same size:

```
position after start: flat
1 open long:  buy 0.00013 BTC IOC -> filled 0.00013 | tx 0x5294024903621466716669f663148ddc3f73a5a13f787b5489293249b32b23bc
position after open: long 0.00013
2 'close' sized 2x the position: sell 0.00026 BTC IOC -> filled 0.00026 | tx 0x75d59bce56f2c2a077ddb1d5efc49930157fcfd98e0509c2e8238d94a69ffcac
position after over-sized close: short 0.00013
cleanup: buy 0.00013 BTC IOC -> filled 0.00013 | tx 0x7a3c5939a18df06dd088bce1bcff167abe7e946b142e9aab6c7dfb44d81d320a
position after cleanup: flat
```

All three receipts have status 1 (blocks 34648243, 34648258, 34648270).

Why it matters for bots: the bot kit's `closePosition()` (packages/perp-core/src/orders.ts) and every close built on it read the size from `previewPerpClosePnl`, then send a plain `ORDER_TYPE.MARKET` order. If the position shrinks between that read and the send (a TP/SL trigger fires, a partial liquidation, a second bot instance, or a fill on a resting order), the close opens a new position on the other side, with no error. The kit's own comments call these "reducing orders", but nothing in the transaction marks them as reducing.

## Suggested fix
Add a reduce-only option to perp `placeOrder`/`placeOrderFor` (and `placePerpOrder` in the SDK), clamped to the live position at execution. Until then, say on the Orders and developer pages that reduce-only is app-only (or stop-only), and have `closePosition()` re-read the position immediately before sending.

## Evidence
Explorer:
- https://explorer.testnet.somnia.network/tokyo/tx/0x5294024903621466716669f663148ddc3f73a5a13f787b5489293249b32b23bc
- https://explorer.testnet.somnia.network/tokyo/tx/0x75d59bce56f2c2a077ddb1d5efc49930157fcfd98e0509c2e8238d94a69ffcac
- https://explorer.testnet.somnia.network/tokyo/tx/0x7a3c5939a18df06dd088bce1bcff167abe7e946b142e9aab6c7dfb44d81d320a

Output: [probes/overclose-flip.out](../probes/overclose-flip.out), 2026-10-27 ~19:05 EAT. The account ended flat with no open orders.

## Environment
@somnia-chain/markets-sdk 0.32.1, perp-core `placeFor` (placeOrderFor through a linked trading key), viem 2.x, Node 22. Network: Somnia Tokyo testnet (Hideki, chain 50383), BTC-PERP pool 0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0. Bot key 0x132182CA8B1296672bab48753b679de23b65656D trading for 0x5b8c61a928dEDf1298F11F75D76690031E66a973.
