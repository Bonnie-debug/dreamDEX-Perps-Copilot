# Bot kit gives the SDK the Shannon address set on Hideki, so with SDK 0.32.1 every market reads `active: true` without checking the pool's close-only gate

Severity: normal
Area: bot kit (perp-core createExchange) / SDK

## Steps to reproduce
1. Look at `packages/perp-core/src/exchange.ts` in dreamdex-bot-kit (main, 2579866): `addresses: SOMNIA_TESTNET_ADDRESSES` is passed for every NETWORK, Hideki included. The comment says "the singletons the SDK looks up sit at the same deterministic addresses there". The dreamDEX developer page says to use `SOMNIA_HIDEKI_TESTNET_ADDRESSES` (https://app.testnet.dreamdex.io/docs/developers/perps-testnet, "Connect").
2. Run `NETWORK=hideki npx tsx probes/kit-shannon-addresses.ts` (read-only). Script: [probes/kit-shannon-addresses.ts](../probes/kit-shannon-addresses.ts). It checks for bytecode at the Shannon addresses on chain 50383, then loads markets twice: once through the kit's `createExchange()`, and once with the SDK set up the way the docs show.

## Expected
The kit's exchange finds the perp factory on Hideki and reads each pool's gates, as the docs setup does. Every market then has `perpStatus` and an `active` flag that reflects `restricted` (close-only) and `registered`. That is what perp-core's own `perpMarkets()` says it relies on ("`active` is derived from the pool's own gates, so an inactive market is one the venue has stopped").

## Actual
In SDK 0.32.1, five entries in the two address sets differ, and none of the Shannon ones has code on Hideki:

```
kit passes perpPoolFactory=0x516d2cb6…a07b (Shannon) | Hideki has 0xE631fAEE…6560 | bytecode on 50383: NONE
kit passes marginBank=0xdd4A14A2…5C4E (Shannon)      | Hideki has 0x478769E1…1394 | bytecode on 50383: NONE
kit passes collateral=0x70a86D88…5d8E (Shannon)      | Hideki has 0x9E9492cC…148f | bytecode on 50383: NONE
kit passes priceFeedScheduler, marketCreator: same story
```

The SDK prefers a configured `addresses.perpPoolFactory` over discovering it from the bank (unified/exchange.js `discoverPerpPools`: "A configured `addresses.perpPoolFactory` wins when present"). Chain discovery therefore calls an empty address and fails, and the SDK falls back to the indexer rows:

```
[bot kit createExchange (NETWORK=hideki)] perps=21 active=21 with chain perpStatus=0
  BTC: active=true perpStatus=null
  perpDiscoveryError: rpc readContract getPerpPools failed: The contract function "getPerpPools" returned no data ("0x").

[SDK per dreamDEX docs (SOMNIA_HIDEKI_TESTNET_ADDRESSES)] perps=21 active=21 with chain perpStatus=21
  BTC: active=true perpStatus={"restricted":false,"registered":true,"tradeable":true}
  perpDiscoveryError: null
```

With no status, the SDK sets `active: status ? !status.restricted && status.registered !== false : true` (unified/exchange.js ~line 1560). So under the kit, every market is `active: true` whatever its gates say. A market switched to close-only would still be listed and traded by `perpMarkets()`/`requireMarket()`, and the first sign would be a revert. Nothing in the kit logs `perpDiscoveryError`, so the fallback is silent. Today all 21 markets are tradeable, so the flags happen to be right. The gate check is what is missing.

Scope note: the upstream kit still pins `markets-sdk ^0.31.0`. In 0.31.0, `SOMNIA_TESTNET_ADDRESSES` has no `perpPoolFactory`, so discovery goes through the bank and works. The bug appears as soon as perp-core is on 0.32.1, the version the dreamDEX docs require (see report 02). We reproduced it with perp-core vendored at ^0.32.1.

## Suggested fix
In `createExchange`, choose `SOMNIA_HIDEKI_TESTNET_ADDRESSES` when NETWORK=hideki (and the Shannon set only for `testnet`). Fix the comment. Log `exchange.perpDiscoveryError` once at startup when it is set.

## Evidence
Full output: [probes/kit-shannon-addresses.out](../probes/kit-shannon-addresses.out), 2026-10-27 ~18:59 EAT (15:59 UTC). Kit source: https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/packages/perp-core/src/exchange.ts (lines 12 and 56).

## Environment
@somnia-chain/markets-sdk 0.32.1, dreamdex-bot-kit perp-core (main 2579866, vendored and bumped to ^0.32.1), Node 22. Network: Somnia Tokyo testnet (Hideki, chain 50383), RPC https://api.hideki2.infra.testnet.somnia.network. Read-only.
