# PUMP, 1000PEPE and DOGE trade in steps of 100/100/10, but the SDK reports `precision.amount: 0` (step 1), and no market field or docs table shows the real step

Severity: normal
Area: SDK (UnifiedMarket metadata) / SDK docs / docs (market table)

## Steps to reproduce
1. Run `NETWORK=hideki OWNER_ADDRESS=<linked account> npx tsx probes/lot-precision.ts` (read-only; with `PRIVATE_KEY` set it also runs three `eth_call` simulations, and sends nothing). Script: [probes/lot-precision.ts](../probes/lot-precision.ts).
2. For every perp market it compares the pool's `lotSize` (on the market row) with `UnifiedMarket.precision.amount` and `limits.amount` from `exchange.loadMarkets()`.
3. On PUMP it then simulates `placeOrderFor` (a resting bid at about 50% of mark) with 1800, 1850 and 1801 PUMP.

## Expected
`precision.amount` describes the size grid, as the SDK docs say (docs/reference/units-and-scales.md line 43: "`lotSize` Raw quantity step. `UnifiedMarket.precision.amount` is its decimal places."). Or, where a step can't be written as decimal places (a step of 10 or 100), the unified market carries the step itself (for example `limits.amount.step`, or ccxt's TICK_SIZE precision mode, where `precision.amount = 100`). The market table on the docs should list the size step next to "Min size".

## Actual
Three of 21 markets have a lot step above 1, and `precision.amount` comes back `0` (that is, step 1) for all three:

```
market   | baseDecimals | lotSize (raw)          | lot step | precision.amount | step implied | limits.amount
1000PEPE | 18           | 100000000000000000000  | 100      | 0                | 1            | {"min":2700}
PUMP     | 6            | 100000000              | 100      | 0                | 1            | {"min":1800}
DOGE     | 8            | 1000000000             | 10       | 0                | 1            | {"min":120}
(the other 18 markets match)
```

The cause is `precisionFromStep()` in dist/unified/structs.js: `Math.min(decimals, Math.max(0, Math.ceil(-Math.log10(step))))`. A step of 10 or 100 gives a negative place count, which is clamped to 0, so the step is lost. `limits` carries only `amount.min`, so the real step is not on `UnifiedMarket` anywhere. Only the raw `info.lotSize` has it.

The pool enforces the real step. A size that is valid on the advertised grid (whole numbers ≥ min) reverts:

```
simulate placeOrderFor PUMP qty 1800 (raw 1800000000): OK
simulate placeOrderFor PUMP qty 1850 (raw 1850000000): REVERT InvalidQuantity ["1850000000","100000000"]
simulate placeOrderFor PUMP qty 1801 (raw 1801000000): REVERT InvalidQuantity ["1801000000","100000000"]
```

Meanwhile `amountToPrecision` quietly uses the real lot, so it disagrees with the precision it publishes: `amountToPrecision(PUMP, 1899)` → `1800`, and below one lot it returns `0` without throwing (`amountToPrecision(PUMP, 99)` → `0`), even though `createOrder` throws `InvalidInputError` for the same input.

Who gets hurt: a ccxt-style bot or UI that builds its size stepper or validation from `precision`/`limits` (the documented fields). It offers 1801–1899 PUMP, which the pool rejects with `InvalidQuantity`. Or it silently gets 1800 when it uses `createOrder`. The docs market table (https://app.testnet.dreamdex.io/docs/trading/perps-testnet#markets) shows "Min size 1,800 PUMP / 2,700 1000PEPE / 120 DOGE" and no step, so a person reading the table can't tell either.

## Suggested fix
Expose the step: either add `limits.amount.step` (human) or switch perps to TICK_SIZE precision (`precision.amount = 100` for PUMP), and fix the units-and-scales.md line. Make `amountToPrecision` throw below one lot like `createOrder` does. Add a "Size step" column to the docs market table.

## Evidence
Full output: [probes/lot-precision.out](../probes/lot-precision.out), captured 2026-10-27 ~18:55 EAT (15:55 UTC). The errors page confirms the meaning of the revert: https://app.testnet.dreamdex.io/docs/developers/contracts/errors ("0x4f174b29 InvalidQuantity(uint256 quantity, uint256 constraint): quantity is not a whole multiple of lotSize").

## Environment
@somnia-chain/markets-sdk 0.32.1 (via perp-core), viem 2.x, Node 22. Network: Somnia Tokyo testnet (Hideki, chain 50383). Simulations used bot key 0x132182CA8B1296672bab48753b679de23b65656D trading for 0x5b8c61a928dEDf1298F11F75D76690031E66a973. No transaction was sent.
