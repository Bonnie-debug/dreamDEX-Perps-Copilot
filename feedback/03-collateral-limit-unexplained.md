# sizeOrder reports "nothing can be placed: collateral" with no next step
Severity: normal
Area: SDK

## Steps to reproduce
1. Use a fresh key with an empty perps account on ETH-PERP or SOL-PERP.
2. Call sizeOrder() from perp-core (or getMaxPerpOrderSize directly) for any long or short.

## Expected
A plain reason like the other limits get: "the perps account has no free collateral: move USDso from Spot to Perps (Perps ⇆ Spot), or claim the paper USDso credit".

## Actual
getMaxPerpOrderSize returns placeable=false, limitedBy="collateral". blockedReason() in packages/perp-core/src/orders.ts has cases only for voucherBlocked, restricted and isolated, so it falls through to the default and prints "nothing can be placed: collateral".

## Evidence
Output of our copilot on SOL-PERP short 25 USDso at 2x:
  - BLOCK: nothing can be placed: collateral

## Environment
@somnia-chain/markets-sdk 0.32.1 (app version per docs); dreamdex-bot-kit main (cloned 2026-10-20), Node 22.
Network: Somnia Tokyo testnet (Hideki, chain 50383). Wallet: 0x132182CA8B1296672bab48753b679de23b65656D
