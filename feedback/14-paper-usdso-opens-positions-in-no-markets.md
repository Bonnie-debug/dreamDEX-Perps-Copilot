# Paper USDso (Perps Arena voucher) can open positions in the six "No" markets: the chain allows all 21 (tx evidence)

Severity: major
Area: contracts (MarginBank voucher market allowlist) / docs (Paper USDso)

## Steps to reproduce
1. Docs, Margin & Liquidations › Paper USDso (https://app.testnet.dreamdex.io/docs/trading/perps-testnet/margin-and-liquidations#paper-usdso): while any of the voucher remains, "You can open or increase positions only in the markets marked **Yes** under Paper USDso in the market table. The six newest markets are not on that list." The market table (https://app.testnet.dreamdex.io/docs/trading/perps-testnet#markets) marks **1000PEPE, LIT, PUMP, VVV, ZEC, ZRO = No**. The developer page says the same: "it can only open positions in the markets on its allowlist".
2. Use an account that still holds the voucher. Ours: `getPerpVoucher(marginBank, 0x5b8c…a973)` → `claimed: true, floor: 1999.946716 USDso` (non-zero floor = paper USDso still in the account).
3. Run `NETWORK=hideki OWNER_ADDRESS=<voucher account> DRY_RUN=false npx tsx probes/voucher-blocked-market.ts` (a linked bot key in PRIVATE_KEY). Script: [probes/voucher-blocked-market.ts](../probes/voucher-blocked-market.ts). It reads `MarginBank.isVoucherMarketAllowed(pool)` for all 21 markets, then opens the minimum ZEC-PERP long (0.009 ZEC, ~12 USDso notional) by IOC and closes it again.

## Expected
`isVoucherMarketAllowed` is `false` for the six "No" pools, and the ZEC open is rejected while the voucher floor is non-zero. Reducing and closing are still allowed.

## Actual
The chain allows every market, and the open fills:

```
1) MarginBank.isVoucherMarketAllowed(pool) vs docs 'Paper USDso' column
  ZRO: chain true | docs No  <-- MISMATCH
  LIT: chain true | docs No  <-- MISMATCH
  VVV: chain true | docs No  <-- MISMATCH
  1000PEPE: chain true | docs No  <-- MISMATCH
  PUMP: chain true | docs No  <-- MISMATCH
  ZEC: chain true | docs No  <-- MISMATCH
  (the other 15: chain true | docs Yes)

2) voucher on 0x5b8c61a928dEDf1298F11F75D76690031E66a973: claimed=true floor=1999.946716 USDso

3) open the minimum ZEC-PERP long from the voucher account (docs: should be rejected)
  open long: buy 0.009 ZEC IOC -> filled 0.009 | tx 0xdf15d6cf…7d86 (status success)
  position after open: long 0.009
4) close: sell 0.009 ZEC IOC -> filled 0.009 | tx 0x7b7d6ed0…f3e (status success)
  voucher floor after: 1999.946716 USDso
```

So either the allowlist was never configured on the Hideki MarginBank (it reads "allowed" for every pool), or the docs table is out of date. In the first case, house money can be used in the newest, thinnest markets that the docs say it is kept out of. In the second, bots and users are told to avoid six markets they can trade. Both the app's table and the developer page give the same wrong answer, so a builder cannot tell which side is right.

## Suggested fix
If the restriction is meant to be on, set the voucher allowlist on the Hideki MarginBank so `isVoucherMarketAllowed` returns `false` for the six pools, and make opens/increases revert for voucher accounts there. If it is meant to be off, remove the "Only some markets" rule and the Paper USDso column from the docs. Either way, generate the docs column from `isVoucherMarketAllowed` so it cannot drift.

## Evidence
- Open: https://explorer.testnet.somnia.network/tokyo/tx/0xdf15d6cf294c70051ac3f50695bdc0f7b6815520f362c82b9a8b665a024b7d86 (block 35219106, success)
- Close: https://explorer.testnet.somnia.network/tokyo/tx/0x7b7d6ed0bc99f15170b4aa6e0da290c733d4a0ace3965e7e632eab71bf087f3e (block 35219127, success)
- Full output: [probes/voucher-blocked-market.out](../probes/voucher-blocked-market.out), 2026-10-28 ~11:11 EAT (08:11 UTC). The position was closed straight away. The account is flat.

## Environment
@somnia-chain/markets-sdk 0.32.1, dreamdex-bot-kit perp-core (main 2579866, vendored at ^0.32.1), Node 22. Somnia Tokyo testnet (Hideki, chain 50383), MarginBank 0x478769E1177C0773c43A593DCCc4Ad15F15F1394, ZEC-PERP pool from the market row. Orders sent by a linked bot (trading key) for the voucher account 0x5b8c61a928dEDf1298F11F75D76690031E66a973.
