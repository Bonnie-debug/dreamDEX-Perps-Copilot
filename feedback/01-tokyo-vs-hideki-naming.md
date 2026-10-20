# Bounty says "Somnia Tokyo testnet", developer docs and bot kit only say "Hideki"
Severity: normal
Area: docs

## Steps to reproduce
1. Read the bounty page (dorahacks.io/hackathon/dreamdex-perps-bounty/detail): every reference is "Somnia Tokyo testnet".
2. Open the linked "Perps on testnet for developers" page (app.testnet.dreamdex.io/docs/developers/perps-testnet): the network is called "Hideki" and the app region "DreamDEX". The explorer link is .../tokyo.
3. Open dreamdex-bot-kit docs/perps.md: "Hideki testnet (chain 50383)", no mention of Tokyo. The config also accepts NETWORK=testnet (Shannon, 50312) for perps.

## Expected
One sentence on the developer page saying Tokyo testnet = Hideki = chain 50383, and that this is the network the bounty counts.

## Actual
The mapping is only written inside the SDK source (dist/chains/definitions/hidekiTestnet.d.ts: "the low-latency Tokyo network"). A builder can reasonably pick Shannon (50312), which the bot kit also lists as a perp network and which is where every public STT faucet points.

## Evidence
- vendor/perp-core/src/config.ts: PERP_NETWORKS = ["hideki", "testnet"]; error text "Perps run on the Hideki testnet ... and on Shannon".
- node_modules/@somnia-chain/markets-sdk/docs/CHAINS.md line 32.

## Environment
@somnia-chain/markets-sdk 0.32.1 (app version per docs); dreamdex-bot-kit main (cloned 2026-10-20), Node 22.
Network: Somnia Tokyo testnet (Hideki, chain 50383). Wallet: 0x132182CA8B1296672bab48753b679de23b65656D
