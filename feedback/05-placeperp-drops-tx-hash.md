# placePerp() returns no transaction hash
Severity: normal
Area: SDK

## Steps to reproduce
1. Call placePerp() from packages/perp-core/src/orders.ts.
2. Inspect the returned PlaceResult.

## Expected
The tx hash in the result, since the SDK response (res.hash) has it and builders need it for journals, explorer links and the bounty's own evidence requirement.

## Actual
PlaceResult is { sent, orderId, filled, noFill }. The hash is checked by assertTxOk and then discarded, so a bot built on the kit cannot link to its own orders without re-implementing placePerp (we had to, in src/index.ts openIoc).

## Evidence
packages/perp-core/src/orders.ts lines 134-200.

## Environment
@somnia-chain/markets-sdk 0.32.1 (app version per docs); dreamdex-bot-kit main (cloned 2026-10-20), Node 22.
Network: Somnia Tokyo testnet (Hideki, chain 50383). Wallet: 0x132182CA8B1296672bab48753b679de23b65656D
