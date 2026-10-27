# Docs market table: 20 of 21 open-interest caps are stale (chain is 2x or 4x), and the per-account cap is a tenth of the OI cap on just 1 market, not "most"

Severity: normal
Area: docs (Perps on Testnet > Markets; Perps for developers > Common pitfalls)

## Steps to reproduce
1. Read https://app.testnet.dreamdex.io/docs/trading/perps-testnet#markets: the "Open interest cap" column (e.g. BTC 246.81545, ETH 3,995.6125, ZEC 420), and the note under the table: "A single account is capped at a tenth of it on most markets."
2. Read https://app.testnet.dreamdex.io/docs/developers/perps-testnet, Common pitfalls: "Each account has a position cap per market, a tenth of the market's open interest cap on most markets ... `getMaxPerpOrderSize` reports the cap as `maxPositionSize`."
3. Run `NETWORK=hideki npx tsx probes/oi-cap-vs-docs.ts` (read-only). Script: [probes/oi-cap-vs-docs.ts](../probes/oi-cap-vs-docs.ts). For each pool it reads `getPerpPoolParameters()` (`maxOpenInterest`, `maxPositionSize`) at one block and compares them with the docs table.
4. Optional cross-check: `probes/maxsize-allmarkets.ts` shows `getMaxPerpOrderSize(...).maxPositionSize` equals the pool's `maxPositionSize` on every market.

## Expected
The table's caps match the pools, and the per-account rule matches what the pools enforce. Or the docs say how to read the live values and leave the ratio out.

## Actual
At block 34647573 (2026-10-27 ~19:02 EAT):

```
market | docs OI cap | chain maxOpenInterest | chain maxPositionSize | account cap / OI cap
BTC    | 246.81545   | 493.6309              | 100                   | 20.26%
ETH    | 3995.6125   | 7991.225              | 399.5612              | 5.00%
SOL    | 47654.44    | 95308.88              | 4765.44               | 5.00%
HYPE   | 23812.72    | 47625.44              | 2381.27               | 5.00%
XRP    | 344632      | 1378528               | 68926.4               | 5.00%
ADA/AVAX/BNB/DOGE/LINK/SUI/XLM: chain cap = 4x docs, account cap 5.00%
NEAR   | 250410      | 1001640               | 50000                 | 4.99%
ZRO/LIT/VVV/1000PEPE/PUMP/WLD: chain cap = 4x docs, account cap 2.50%
ZEC    | 420         | 1680                  | 420                   | 25.00%
TAO    | 2185.491    | 2185.491              | 218.549               | 10.00%   <- the only match
```

- On 20 of 21 markets the docs OI cap is half (BTC, ETH, SOL, HYPE) or a quarter (the other 16) of the live `maxOpenInterest`. Only TAO matches.
- The per-account cap is a tenth of the OI cap on 1 market (TAO). Elsewhere it is about 5% (12 markets), 2.5% (6), 20% (BTC) or 25% (ZEC).
- Read against the table's own (stale) caps, the account caps match "a tenth" on 10 markets (ZRO, LIT, VVV, 1000PEPE, PUMP, TAO, WLD, HYPE, SOL, ETH). That suggests the OI caps were raised and the table and the "a tenth" sentence were not updated. The per-account caps did not change.

Why it matters: a bot or trader who sizes from the docs ("a tenth of 246.8 BTC = 24.7 BTC") gets the wrong number in both directions. The live BTC account cap is 100 BTC, and the live ETH cap is 399.56 ETH, which is 5% of the live OI cap, not 10%. The table says "These figures are read from the live markets", which is not true today.

## Suggested fix
Regenerate the market table from `getPerpPoolParameters()` (and add a per-account cap column from `maxPositionSize`, plus the size step, see report 10). Replace "a tenth of it on most markets" with "read `maxPositionSize` from `getMaxPerpOrderSize` or `getPerpPoolParameters()`; it varies by market".

## Evidence
Full outputs: [probes/oi-cap-vs-docs.out](../probes/oi-cap-vs-docs.out) and [probes/maxsize-allmarkets.out](../probes/maxsize-allmarkets.out) (2026-10-27 ~19:01–19:02 EAT). Docs pages fetched the same day.

## Environment
@somnia-chain/markets-sdk 0.32.1, viem 2.x, Node 22. Network: Somnia Tokyo testnet (Hideki, chain 50383). Read-only.
