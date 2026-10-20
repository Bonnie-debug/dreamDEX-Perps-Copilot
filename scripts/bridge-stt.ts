// Bridge native STT from Somnia Shannon testnet (50312) to Hideki/Tokyo (50383).
//   npx tsx scripts/bridge-stt.ts 1.5
import { BridgeToken, ChainId, createBridgeTransfer, sendBridgeStep, somniaShannon, hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import { createPublicClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const amount = parseEther(process.argv[2] ?? "1");
const shannon = createPublicClient({ chain: somniaShannon, transport: http() });
const hideki = createPublicClient({ chain: hidekiTestnet, transport: http("https://api.hideki2.infra.testnet.somnia.network") });

console.log("shannon balance", formatEther(await shannon.getBalance({ address: account.address })));
console.log("hideki balance ", formatEther(await hideki.getBalance({ address: account.address })));
const plan = createBridgeTransfer({ token: BridgeToken.STT, from: ChainId.somniaShannon, to: ChainId.hidekiTestnet, amount, recipient: account.address });
if (plan.destination.requiresDestinationLiquidity) {
  const liq = await hideki.getBalance({ address: plan.destination.router });
  console.log("hideki router liquidity", formatEther(liq));
  if (liq < amount) throw new Error("destination router short");
}
if (process.argv.includes("--dry")) process.exit(0);
const receipt = await sendBridgeStep(shannon, plan.bridgeStep, { account });
console.log("bridge tx", receipt.transactionHash, receipt.status);
