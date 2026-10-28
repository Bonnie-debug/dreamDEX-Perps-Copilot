# dreamDEX Perps Copilot

Say the trade in plain English. The copilot reads it, checks it against the live pool, tells you in one screen what could go wrong, and only then places it on dreamDEX perps. Every order is written to a journal with its transaction hash, and the last trade becomes a shareable post.

Built for the **dreamDEX Perps Builder Bounty** on **Somnia Tokyo testnet** (Hideki, chain 50383). Category: bots and agents.

```
$ npm run plan -- "long btc 20 usdso 5x tp 2 sl 1"

LONG 20 USDso of BTC-PERP at 5x  (parsed by parser)
size        0.00024 BTC at mark 82518.80  | book 82711.00 / 82711.10  (0.0 bps spread)
margin      ~4.00 USDso needed
exits       take-profit +2%  stop-loss -1%  | reward:risk 2.00
liquidation ~17.50% away (estimate)
funding     130.47% APR, you PAY about 0.0715 USDso a day
  - caution: the book trades 28.7 bps above the mark; PnL and liquidation follow the mark
  - caution: you pay 130.5% APR funding holding this long
VERDICT     CAUTION
```

## Who it is for

Traders who know what they want ("short SOL, 25 dollars, 2x, tight stop") but do not want to learn tick sizes, lot sizes, per-market base decimals, voucher allowlists and funding sign conventions before their first perps order. And bot builders who want a safe, readable front door to the Markets SDK.

## What it does

1. **Reads the idea.** A deterministic parser handles side, market, size, leverage, take-profit and stop-loss. If `OPENAI_API_KEY` (or any OpenAI-compatible `LLM_BASE_URL`) is set, looser phrasing goes to a model for structured extraction. The model never places orders: it only fills fields, and every field is validated again.
2. **Checks it live.** Every number comes from the pool, the order book or the MarginBank at that moment:
   - live mark, best bid and ask, spread, and how far the book trades from the mark
   - funding APR and whether *you* pay or receive it on this side, in USDso per day
   - margin needed (the higher of your leverage and the market's own initial margin)
   - an estimated liquidation distance, and a block if your stop sits beyond it
   - reward to risk
   - the pool's own `getMaxPerpOrderSize` answer and what limits it (collateral, voucher allowlist, position cap)
3. **Gives a verdict.** `GO`, `CAUTION` or `BLOCK`, with the reason for each flag in plain words. `BLOCK` never trades.
4. **Trades and protects.** `trade` opens with an IOC priced through the touch with slippage room, then:
   - on the key's own account, arms a linked take-profit and stop-loss on the market's stop registry, so the exits hold even if the copilot stops
   - on a linked app wallet (Link a bot), watches the mark and closes at either level itself, since only the account can arm stops
5. **Journals it.** `journal/trades.jsonl` holds every plan, open, bracket and close with timestamps, the verdict and the explorer link. `npm run journal` prints the log and a trade card ready to post.

The repeat loop: plan, trade, share the card, come back with the next idea. The journal is the trader's record of which risk flags they ignored and how that went.

## Run it

```bash
git clone https://github.com/Bonnie-debug/dreamDEX-Perps-Copilot.git && cd dreamDEX-Perps-Copilot
npm install
cp .env.example .env      # PRIVATE_KEY = a fresh bot key, never your main wallet
npm run markets            # the 21 live perp markets
npm run plan  -- "long eth 40 usdso 3x tp 2% sl 1%"
npm run trade -- "long eth 40 usdso 3x tp 2% sl 1%"            # dry run
DRY_RUN=false npm run trade -- "long eth 40 usdso 3x tp 2% sl 1%"
DRY_RUN=false npm run close -- btc                                # close the whole BTC position
npm run journal
```

To trade your app wallet: open the dreamDEX testnet app, **Link a bot**, paste the bot key's address with Perps ticked and gas on, then set `OWNER_ADDRESS` to that wallet. Margin comes from the wallet's Perps account (Perps Arena paper USDso works on the markets its voucher allows).

Tunables (env): `COPILOT_SLIPPAGE_BPS` (30), `COPILOT_MAX_SPREAD_BPS` (30), `COPILOT_MAX_MARK_GAP_BPS` (15), `COPILOT_MAX_FUNDING_APR_PCT` (50), `COPILOT_WATCH_MAX_MIN` (120).

## How it is built

- `src/intent.ts`: parser plus optional LLM extraction and validation
- `src/risk.ts`: the live pre-trade checks and the plain-English report
- `src/journal.ts`: append-only journal and trade card
- `src/index.ts`: CLI, IOC placement that keeps the tx hash, bracket or watched exits
- `vendor/perp-core`: the MIT-licensed perp core from [dreamdex-bot-kit](https://github.com/somnia-chain/dreamdex-bot-kit), moved to `@somnia-chain/markets-sdk` ^0.32.1

The liquidation distance is an estimate (initial margin fraction minus an assumed maintenance of half of it). The pool's real figure depends on the whole cross-margin account, so the copilot treats it as a guard rail and says so on screen.

## Testnet evidence

Orders placed by the copilot on Somnia Tokyo testnet, with explorer links:

First live round trip, 2026-10-20, BTC-PERP, placed by the bot key `0x1321…656D` trading for the linked app wallet `0x5b8c…a973` (Perps Arena paper USDso):

| Step | What | Transaction |
| --- | --- | --- |
| Plan | `long btc 20 usdso 2x tp 2% sl 1%`: verdict CAUTION (book 21.9 bps above the mark, 132.7% APR funding paid by longs) | not on-chain |
| Open | IOC buy, filled 0.00024 BTC near mark 82,417.65 | [0xef08…daf5](https://explorer.testnet.somnia.network/tokyo/tx/0xef089b3b7564690abfe14a00e46ccaccb422b10cece14d0550e02b6e93bddaf5) |
| Close | `npm run close -- btc`, IOC sell, filled 0.00024 BTC | [0x346a…57ef](https://explorer.testnet.somnia.network/tokyo/tx/0x346adf26c1d58a990e868c9d04b03d5db8bd50555cf138d031dce8a83dee57ef) |

Both receipts have status 1 (blocks 28,720,195 and 28,722,202). Every plan, open and close is in `journal/trades.jsonl`.

Second live round trip, 2026-10-21, ETH-PERP, same bot and wallet. This one passed every check, so it shows the `GO` path end to end, with the copilot's own exit watcher closing the position:

| Step | What | Transaction |
| --- | --- | --- |
| Plan | `long eth 20 usdso 2x tp 2% sl 1%`: verdict GO (0.8 bps spread, 10.95% APR funding, liquidation ~47.5% away) | not on-chain |
| Open | IOC buy, filled 0.0079 ETH near mark 2,509.27 | [0xa449…1bf9](https://explorer.testnet.somnia.network/tokyo/tx/0xa4493108a4d2751cd638036fd260134be06b2bdf156b14c63c43ef5ffac21bf9) |
| Close | exit watcher, time-out close, IOC sell, filled 0.0079 ETH | [0x04cf…62af](https://explorer.testnet.somnia.network/tokyo/tx/0x04cf875a4a023a5103633ffe86e84f2b8ccb9f219ab22dffa36781a0e9a962af) |

Both receipts have status 1 (blocks 29,458,084 and 29,458,745).

Third live round trip, 2026-10-21, SOL-PERP short, same bot and wallet. Verdict CAUTION (shorts paying 88.4% APR funding), and the close hash is now recorded by the exit watcher itself:

| Step | What | Transaction |
| --- | --- | --- |
| Plan | `short sol 20 usdso 2x tp 2% sl 1%`: verdict CAUTION (2.8 bps spread, shorts pay 88.4% APR funding) | not on-chain |
| Open | IOC sell, filled 0.18 SOL near mark 108.44 | [0x5a9b…ce87](https://explorer.testnet.somnia.network/tokyo/tx/0x5a9becbea4ce3b3447530acc4e889966d9ea57d2c272da3ca1ce8beea41fce87) |
| Close | exit watcher, time-out close, IOC buy, filled 0.18 SOL | [0x8633…026c](https://explorer.testnet.somnia.network/tokyo/tx/0x86333a593ae835b62b16b0c6631f7b32e68e04f255c0c23326bb4b1f90b1026c) |

## X posts

- [Launch post: plain-English perps copilot, first testnet round trip](https://x.com/kilonode_ai/status/2112626975953317919)
- [GO / CAUTION / BLOCK: first BTC test got CAUTION on ~133% annualized funding](https://x.com/kilonode_ai/status/2112867027744661675)
- [Testnet find: bot kit order helper drops the tx hash, so the copilot keeps it for explorer links](https://x.com/kilonode_ai/status/2112932423562321993)

## Feedback

Reproducible reports for the Feedback track are in [`feedback/`](feedback), one issue per file.

1. [Bounty says "Somnia Tokyo testnet"; docs and bot kit only say "Hideki"](feedback/01-tokyo-vs-hideki-naming.md)
2. [Bot kit installs markets-sdk 0.30/0.31; docs are written for 0.32.1](feedback/02-botkit-sdk-version-drift.md)
3. [sizeOrder reports a collateral limit with no next step](feedback/03-collateral-limit-unexplained.md)
4. [Bot kit says stops lock SOMI on testnet, where the coin is STT](feedback/04-stop-deposit-called-somi-on-testnet.md)
5. [placePerp() returns no transaction hash](feedback/05-placeperp-drops-tx-hash.md)
6. [Voucher eligibility says true, but claim() reverts](feedback/06-voucher-eligible-but-claim-reverts.md)
7. [Funding docs name the wrong paying side on 12 of 21 markets](feedback/07-funding-docs-wrong-side.md)
8. [SDK hidekiTestnet says 10 ms blocks; the chain makes ~100 ms blocks](feedback/08-hideki-blocktime-100ms-not-10ms.md)
9. [SDK says Hideki has no explorer; the Tokyo explorer works](feedback/09-hideki-chain-has-no-explorer.md)
10. [precision.amount hides the lot step on PUMP/1000PEPE/DOGE](feedback/10-precision-amount-hides-lot-step.md)
11. [Bot kit passes the Shannon address set on Hideki](feedback/11-botkit-passes-shannon-addresses-on-hideki.md)
12. [Docs OI caps stale; per-account cap is a tenth on only 1 market](feedback/12-oi-cap-table-stale-and-account-cap-not-a-tenth.md)
13. [No reduce-only for perp orders, so an oversized close flips the position](feedback/13-no-reduce-only-for-perp-orders-close-can-flip.md)
14. [Paper USDso can open positions in the six "No" markets; the chain allows all 21](feedback/14-paper-usdso-opens-positions-in-no-markets.md)
15. [Docs say a perp-pool tx costs 0.0003–0.003 STT; a single order costs 0.009–0.026 STT](feedback/15-perp-gas-cost-docs-range-too-low.md)

## License

MIT. `vendor/perp-core` is © DreamDEX S.A., MIT, see its LICENSE.
