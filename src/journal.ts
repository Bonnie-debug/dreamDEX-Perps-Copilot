// Append-only trade journal (JSON lines) plus a shareable trade card.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const FILE = resolve(process.env.COPILOT_JOURNAL ?? "journal/trades.jsonl");
const EXPLORER = process.env.COPILOT_EXPLORER_TX ?? "https://explorer.testnet.somnia.network/tokyo/tx/";

export type Entry = Record<string, unknown> & { kind: string; at: string };

const big = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

export function appendJournal(e: Entry): void {
  mkdirSync(dirname(FILE), { recursive: true });
  appendFileSync(FILE, JSON.stringify(e, big) + "\n");
}

export function readJournal(): Entry[] {
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Entry);
}

export function txUrl(hash?: string): string {
  return hash ? `${EXPLORER}${hash}` : "(no hash)";
}

export function printJournal(): void {
  const rows = readJournal();
  if (!rows.length) return console.log("journal is empty");
  for (const r of rows) {
    const i = r.intent as { side?: string; symbol?: string; notionalUsdso?: number } | undefined;
    console.log(`${r.at}  ${r.kind.padEnd(7)} ${i?.side ?? ""} ${i?.symbol ?? ""} ${i?.notionalUsdso ?? ""}` +
      (r.verdict ? `  verdict=${r.verdict}` : "") + (r.tx ? `  ${txUrl(String(r.tx))}` : "") + (r.reason ? `  ${r.reason}` : ""));
  }
}

export function lastTrade(): Entry | undefined {
  return [...readJournal()].reverse().find((r) => r.kind === "open");
}

/** A short, factual post a trader can share. Every number comes from the journal. */
export function tradeCard(open: Entry): string {
  const i = open.intent as { side: string; symbol: string; notionalUsdso: number; leverage: number; takeProfitPct: number; stopLossPct: number };
  return [
    `${i.side.toUpperCase()} ${i.symbol} on @DreamDEXSomnia testnet, ${i.notionalUsdso} USDso at ${i.leverage}x.`,
    `Risk-checked first: tp +${i.takeProfitPct}%, sl -${i.stopLossPct}%.`,
    `Fully onchain: ${txUrl(String(open.tx))}`,
  ].join(" ");
}
