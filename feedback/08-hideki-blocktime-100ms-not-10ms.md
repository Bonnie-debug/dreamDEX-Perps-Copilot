# hidekiTestnet says 10 ms blocks (blockTime: 10); the chain makes ~100 ms blocks

Severity: normal
Area: SDK (chain definition) / SDK docs

## Steps to reproduce
1. Read node_modules/@somnia-chain/markets-sdk (0.32.1):
   - dist/chains/definitions/hidekiTestnet.js: "blocks land every **10 ms** (~100 blocks/s) instead of Shannon's 100 ms", and `blockTime: 10`.
   - docs/CHAINS.md line 24 and docs/reference/networks-and-endpoints.md line 25: Hideki "10 ms"; CHAINS.md line 32 "~100 blocks/s"; README.md line 233 "10 ms blocks"; docs/BRIDGE.md line 4 "~10 ms-block network".
   - docs/CHAINS_WALKTHROUGH.md line 81: "Hideki's `10` means `waitForTransactionReceipt` polls fast enough to return in tens of milliseconds".
   - dist/syncStatus.js: `AHEAD_TOLERANCE_BLOCKS = 10000n`, commented "10,000 blocks is 100 s on Hideki (10 ms blocks)".
2. Measure the chain:
   ```sh
   R=https://api.hideki2.infra.testnet.somnia.network
   b(){ curl -s -X POST $R -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBlockByNumber\",\"params\":[\"$1\",false]}" | python3 -c "import sys,json;b=json.load(sys.stdin)['result'];print(int(b['number'],16),int(b['timestamp'],16))"; }
   b latest; sleep 60; b latest; b 0x1
   ```
3. Cross-check with the Tokyo explorer: `curl -s https://explorer.testnet.somnia.network/tokyo/api/v2/stats` -> `"average_block_time":100`.

## Expected
`blockTime` and the docs match the chain.

## Actual
2026-10-21 ~19:07 EAT: 29466465 @ 1792598608 -> 29467069 @ 1792598668 = 604 blocks in 60 s = **99.3 ms per block**. Since genesis (block 1 @ 1789646421, the 2026-09-17 regenesis) to block 29467076 @ 1792598669: 29.47M blocks in 2,952,248 s = **99.8 ms per block**, i.e. ~10 blocks/s, the same as Shannon and mainnet. The explorer agrees (average_block_time 100).

Consequences: viem sizes its polling from `blockTime`, so receipt waits poll ~10x more often than blocks arrive; anyone converting blocks to time with the documented figure is off by 10x (e.g. the indexer "ahead" tolerance of 10,000 blocks is ~17 minutes on Hideki, not 100 s; a bot that waits "N blocks = N×10 ms" waits 10x longer than intended). The latency pitch in the docs ("~100 blocks/s", "the interesting target for latency work") is not what builders get on this testnet today.

## Suggested fix
Set `blockTime: 100` (or the measured value) in hidekiTestnet and update the five doc mentions and the syncStatus comment, or, if 10 ms is the target, note that the current Hideki v2 testnet runs at ~100 ms.

## Environment
@somnia-chain/markets-sdk 0.32.1, Node 22. Network: Somnia Tokyo testnet (Hideki, chain 50383), RPC https://api.hideki2.infra.testnet.somnia.network. Read-only.
