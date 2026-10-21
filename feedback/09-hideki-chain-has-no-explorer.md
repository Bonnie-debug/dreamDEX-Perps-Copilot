# SDK's hidekiTestnet has no blockExplorers and the SDK docs say Hideki has no explorer; the dreamDEX docs link the Tokyo explorer

Severity: normal
Area: SDK (chain definition) / SDK docs

## Steps to reproduce
1. `import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains"; console.log(hidekiTestnet.blockExplorers)` -> `undefined`.
2. Read dist/chains/definitions/hidekiTestnet.js: "No public block explorer is known for Hideki, so that field stays unset." and docs/reference/networks-and-endpoints.md line 30: "Elwood, Hideki, and local carry no explorer." docs/CHAINS.md line 24 shows "—" in the explorer column for Hideki, while mainnet and Shannon get links.
3. Open https://app.testnet.dreamdex.io/docs/developers/perps-testnet: the Network table lists **Explorer: explorer.testnet.somnia.network/tokyo**.
4. Confirm that explorer serves this chain: `curl -s https://explorer.testnet.somnia.network/tokyo/api/v2/transactions/0xef089b3b7564690abfe14a00e46ccaccb422b10cece14d0550e02b6e93bddaf5` returns our BTC-PERP order (block 28720195, status ok), and `/tokyo/api/v2/stats` reports total_blocks within a few dozen of the Hideki RPC head (29464635 vs 29464671 at 19:00 EAT on 2026-10-21).

## Expected
`hidekiTestnet.blockExplorers.default = { name: "Somnia Tokyo Explorer", url: "https://explorer.testnet.somnia.network/tokyo", apiUrl: "https://explorer.testnet.somnia.network/tokyo/api" }`, as somniaShannon and somniaMainnet already have, and the SDK docs listing it.

## Actual
No explorer in the chain object. Wallets added via viem/wagmi `addChain` get no "view on explorer" link, viem's `getBlockExplorerUrl`-style helpers return nothing, and bots built on the SDK (including the bot kit) have to hardcode the URL to show the transaction links the bounty asks for as evidence. The SDK's own docs tell builders the explorer does not exist.

## Environment
@somnia-chain/markets-sdk 0.32.1, Node 22. Network: Somnia Tokyo testnet (Hideki, chain 50383). Read-only.
