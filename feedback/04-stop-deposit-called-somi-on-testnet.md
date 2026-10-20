# Bot kit says stops lock "SOMI" on testnet, where the coin is STT
Severity: normal
Area: SDK

## Steps to reproduce
1. Run perp-starter on NETWORK=hideki with a key that trades its own account.
2. Read the startup line and bracket logs.

## Expected
"each pending stop locks 0.15 STT", matching the testnet docs ("Stop orders carry 0.15 STT each") and the chain definition in perp-core config.ts (symbol STT for chain 50383).

## Actual
strategies/perp-starter/src/index.ts:100 prints "... SOMI, refunded on cancel"; packages/perp-core/src/stops.ts:81, 128 and 132 print "0.30 SOMI locked", "reclaim their SOMI", "SOMI refunded". A testnet user holding only STT is told they need SOMI.

## Evidence
grep -n SOMI strategies/perp-starter/src/index.ts packages/perp-core/src/stops.ts

## Environment
@somnia-chain/markets-sdk 0.32.1 (app version per docs); dreamdex-bot-kit main (cloned 2026-10-20), Node 22.
Network: Somnia Tokyo testnet (Hideki, chain 50383). Wallet: 0x132182CA8B1296672bab48753b679de23b65656D
