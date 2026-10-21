# Funding docs say "perp below the index: shorts pay longs", but 12 of 21 markets charge longs while their premium is negative

Severity: major
Area: docs (Perps on Testnet > Funding)

## Steps to reproduce
1. Read https://app.testnet.dreamdex.io/docs/trading/perps-testnet/funding, "Who pays whom":
   - "Perp above the index (positive funding): longs pay shorts."
   - "Perp below the index (negative funding): shorts pay longs."
   The page gives no formula for the rate itself and mentions no interest component or clamp.
2. For every perp market, read the pool with `client.getPerpState(poolAddress)` (markets-sdk 0.32.1) and compare `emaPremium` (the perp-vs-index premium the rate is built from), `markPrice - indexPrice`, and `fundingRate`.
   Script (save as probes/funding-sign.ts, run with `NETWORK=hideki npx tsx probes/funding-sign.ts`, read-only, no key needed):
   ```ts
   import { SOMNIA_HIDEKI_TESTNET_ADDRESSES, SomniaMarkets } from "@somnia-chain/markets-sdk"
   import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains"
   const m = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql", addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES })
   const E18 = 10n ** 18n, I = 10n ** 14n, C = 5n * 10n ** 14n // 0.01% and 0.05%
   const clamp = (x: bigint, lo: bigint, hi: bigint) => (x < lo ? lo : x > hi ? hi : x)
   const pct = (x: bigint) => (Number(x) / 1e16).toFixed(4) + "%"
   for (const p of await m.client.listPerpMarkets()) {
     const s = await m.client.getPerpState(p.poolAddress)
     const gap = ((s.markPrice - s.indexPrice) * E18) / s.indexPrice
     const pred = s.emaPremium + clamp(I - s.emaPremium, -C, C)
     console.log(p.baseSymbol, pct(gap), pct(s.emaPremium), pct(s.fundingRate), pred === s.fundingRate ? "formula match" : pct(pred))
   }
   process.exit(0)
   ```

## Expected
Either the sign of the funding rate follows the sign of the perp-vs-index premium, as the page says, or the page states the real rule so traders and bots know which side pays.

## Actual
On 2026-10-21 ~19:05 EAT (block 29467806), 12 of 21 markets had a **negative** `emaPremium` (perp below the index) and a **positive** `fundingRate` (longs pay shorts): ZRO, 1000PEPE, PUMP, ZEC, TAO, WLD, XLM, AVAX, LINK, ADA, BNB, ETH. Measured on the instantaneous mark-vs-index gap instead, 14 of 21 markets paid the opposite side to the docs' rule (BTC: mark 0.042% below index, funding +0.1182% per 8 h, longs pay).

Selected rows (market | mark-index | emaPremium | fundingRate per 8 h):
```
XLM  | -0.0397% | -0.0000% | 0.0100%   longs pay
ADA  | -0.0547% | -0.0003% | 0.0100%   longs pay
PUMP | -0.0966% | -0.0084% | 0.0100%   longs pay
WLD  | -0.0675% | -0.0414% | 0.0086%   longs pay
ETH  | -0.0446% | -0.0371% | 0.0100%   longs pay
LIT  | -0.0753% | -0.0591% | -0.0091%  shorts pay
SOL  | -0.0438% | -0.1307% | -0.0807%  shorts pay
```

Every one of the 21 rates matches, to the wei, a Binance-style formula the docs never mention:

    fundingRate = P + clamp(0.01% − P, −0.05%, +0.05%)     (P = emaPremium, per 8-hour window)

So there is a built-in +0.01% per 8 h interest leg: longs pay shorts until the premium is below about −0.04%, and the rate tracks an EMA of the premium, not the live gap. A trader who opens a short on a market trading slightly under the index "to collect funding", as the page implies, pays funding instead. The kit's `fundingSide()` (vendor/perp-core funding.ts) reads the rate correctly; it is only the docs that point the wrong way.

## Suggested fix
Replace "Who pays whom" with the rule the contract applies: positive rate = longs pay; the rate is the EMA premium plus an interest term of 0.01% per window, with the difference clamped to ±0.05%; so a small negative premium still has longs paying. Name `emaPremium` and `fundingRate` from `getPerpState` as the fields to read.

## Evidence
Captured twice (19:03 and 19:05 EAT): 15/21 and 14/21 markets contradict the docs on the live mark-vs-index gap, 12/21 on the EMA premium, and the formula matches 21/21 both times. Full output of the second run (an extended version of the script above):
```
market | mark-index | emaPremium | fundingRate (8h) | docs say | pool says | P+clamp(0.01%-P,±0.05%)
ZRO | 0.0074% | -0.0057% | 0.0100% | longs pay | longs pay | match
LIT | -0.0753% | -0.0591% | -0.0091% | shorts pay | shorts pay | match
VVV | 0.0647% | 0.0071% | 0.0100% | longs pay | longs pay | match
1000PEPE | -0.0305% | -0.0011% | 0.0100% | shorts pay | longs pay  <-- contradicts docs | match
PUMP | -0.0966% | -0.0084% | 0.0100% | shorts pay | longs pay  <-- contradicts docs | match
ZEC | 0.0380% | -0.0422% | 0.0078% | longs pay | longs pay | match
TAO | -0.0349% | -0.0016% | 0.0100% | shorts pay | longs pay  <-- contradicts docs | match
WLD | -0.0675% | -0.0414% | 0.0086% | shorts pay | longs pay  <-- contradicts docs | match
NEAR | -0.0247% | -0.1481% | -0.0981% | shorts pay | shorts pay | match
XLM | -0.0397% | -0.0000% | 0.0100% | shorts pay | longs pay  <-- contradicts docs | match
AVAX | -0.0604% | -0.0193% | 0.0100% | shorts pay | longs pay  <-- contradicts docs | match
LINK | -0.0706% | -0.0096% | 0.0100% | shorts pay | longs pay  <-- contradicts docs | match
SUI | -0.0611% | 0.0420% | 0.0100% | shorts pay | longs pay  <-- contradicts docs | match
ADA | -0.0547% | -0.0003% | 0.0100% | shorts pay | longs pay  <-- contradicts docs | match
BNB | -0.0166% | -0.0160% | 0.0100% | shorts pay | longs pay  <-- contradicts docs | match
DOGE | -0.0558% | 0.0003% | 0.0100% | shorts pay | longs pay  <-- contradicts docs | match
XRP | -0.0363% | 0.0569% | 0.0100% | shorts pay | longs pay  <-- contradicts docs | match
HYPE | -0.0367% | -0.2658% | -0.2158% | shorts pay | shorts pay | match
SOL | -0.0438% | -0.1307% | -0.0807% | shorts pay | shorts pay | match
ETH | -0.0446% | -0.0371% | 0.0100% | shorts pay | longs pay  <-- contradicts docs | match
BTC | -0.0422% | 0.1682% | 0.1182% | shorts pay | longs pay  <-- contradicts docs | match

14/21 markets pay the opposite side to the docs' rule. 2026-10-21T16:05:42.055Z block 29467806
```

## Environment
@somnia-chain/markets-sdk 0.32.1, viem 2.x, Node 22. Network: Somnia Tokyo testnet (Hideki, chain 50383). Read-only calls, no wallet needed.
