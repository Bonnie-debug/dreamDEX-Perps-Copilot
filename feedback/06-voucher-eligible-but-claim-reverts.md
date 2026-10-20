# Perps voucher: eligibility says true, but claim() reverts with an undecoded error

Severity: major
Area: SDK / contracts (perps voucher)

## Steps to reproduce
1. On Somnia Tokyo testnet (Hideki, chain 50383), take a fresh EOA that holds STT for gas and has never claimed: `0x132182CA8B1296672bab48753b679de23b65656D` (it holds 5 STT).
2. `client.getPerpVoucherEligibility(marginBank, address)` for the BTC-PERP margin bank.
3. `trader.claimPerpVoucher({ marginBank })` (see `scripts/claim-voucher.ts` in this repo).

## Expected
Either the claim succeeds and credits 1,000 paper USDso (eligibility said so), or eligibility returns false with a reason the claim would give.

## Actual
Eligibility: `{ eligible: true, grantAmount: 1000000000000000000000n }`.
The claim then reverts: `ContractRevertError: @somnia-chain/markets-sdk: claim reverted: for an unknown reason.` Revert data `0x3e31dcc2`, to `0x2ACD9EFdA721450906bfE1bef3edE269636E42C4`, calldata `0x4e71d92d` (`claim()`).
The selector `0x3e31dcc2` matches none of the voucher errors in the SDK's ABIs (AlreadyClaimed, NothingToClaim, NoCreditToReclaim, VoucherAccountCannotBeMainFunded, …), so the SDK cannot decode it and the builder gets no reason. Two problems: the eligibility read disagrees with the claim, and the revert is missing from the SDK's error ABI.

## Evidence
Run `NETWORK=hideki npx tsx scripts/claim-voucher.ts` with the key above (2026-10-20 ~22:20 EAT). The full error output includes the raw call arguments quoted above.

## Environment
@somnia-chain/markets-sdk 0.32.1 via dreamdex-bot-kit perp-core, viem 2.57.7, Node 22. Network: Somnia Tokyo testnet (Hideki, chain 50383).
