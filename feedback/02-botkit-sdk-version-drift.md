# Bot kit installs markets-sdk 0.30.0 and 0.31.0, docs are written for 0.32.1
Severity: normal
Area: SDK

## Steps to reproduce
1. git clone https://github.com/somnia-chain/dreamdex-bot-kit && npm ci
2. find . -path '*node_modules/@somnia-chain/markets-sdk/package.json' | xargs grep '"version"'

## Expected
The kit resolves the version the developer docs use ("this page uses version 0.32.1, the one the app runs").

## Actual
./node_modules/@somnia-chain/markets-sdk -> 0.30.0
./packages/perp-core/node_modules/@somnia-chain/markets-sdk -> 0.31.0 (perp-core declares ^0.31.0)
Two copies of the SDK are installed side by side, and neither is 0.32.1, so behaviour can differ from the docs and from the app.

## Evidence
npm view @somnia-chain/markets-sdk version -> 0.32.1. Bumping perp-core to ^0.32.1 typechecks and runs cleanly for us (this repo vendors perp-core at ^0.32.1).

## Environment
@somnia-chain/markets-sdk 0.32.1 (app version per docs); dreamdex-bot-kit main (cloned 2026-10-20), Node 22.
Network: Somnia Tokyo testnet (Hideki, chain 50383). Wallet: 0x132182CA8B1296672bab48753b679de23b65656D
