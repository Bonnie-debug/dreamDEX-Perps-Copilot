// Turn a plain-English trade idea into a structured intent.
//
//   "long eth 40 usdso 3x tp 2% sl 1%"
//   "short 25 dollars of SOL at 2x, take profit 3 percent, stop 1.5"
//
// A deterministic parser runs first and always. If OPENAI_API_KEY (or any
// OpenAI-compatible LLM_BASE_URL + LLM_API_KEY) is set, free-form text the
// parser cannot fully read is sent to the model for structured extraction,
// and the result is validated by the same rules. The model never places
// orders; it only fills in fields, and every field is re-checked.

export interface TradeIntent {
  side: "long" | "short";
  symbol: string; // BASE-PERP
  notionalUsdso: number;
  leverage: number;
  takeProfitPct: number;
  stopLossPct: number;
  source: "parser" | "llm";
  raw: string;
}

const DEFAULTS = { leverage: 2, takeProfitPct: 2, stopLossPct: 1 };

const SIDE_WORDS: Record<string, "long" | "short"> = {
  long: "long", buy: "long", bull: "long", bullish: "long", up: "long",
  short: "short", sell: "short", bear: "short", bearish: "short", down: "short",
};

const NUM = String.raw`(\d+(?:\.\d+)?)`;

export function parseIntent(text: string, knownBases: string[]): Partial<TradeIntent> {
  const t = ` ${text.toLowerCase().replace(/,/g, " ")} `;
  const out: Partial<TradeIntent> = { raw: text, source: "parser" };

  for (const [w, s] of Object.entries(SIDE_WORDS)) {
    if (new RegExp(`\\b${w}\\b`).test(t)) { out.side = s; break; }
  }

  // Longest base first so "1000pepe" wins over "pepe"-like partials.
  const bases = [...knownBases].sort((a, b) => b.length - a.length);
  for (const b of bases) {
    if (new RegExp(`\\b${b.toLowerCase()}(?:-perp)?\\b`).test(t)) { out.symbol = `${b.toUpperCase()}-PERP`; break; }
  }

  const lev = t.match(new RegExp(`${NUM}\\s*x\\b`)) ?? t.match(new RegExp(`leverage\\s*${NUM}`));
  if (lev) out.leverage = Number(lev[1]);

  const tp = t.match(new RegExp(`(?:tp|take[ -]?profit|target)\\s*(?:at|of)?\\s*${NUM}`));
  if (tp) out.takeProfitPct = Number(tp[1]);
  const sl = t.match(new RegExp(`(?:sl|stop(?:[ -]?loss)?)\\s*(?:at|of)?\\s*${NUM}`));
  if (sl) out.stopLossPct = Number(sl[1]);

  const notional =
    t.match(new RegExp(`${NUM}\\s*(?:usdso|usd|usdc|dollars?|\\$)`)) ??
    t.match(new RegExp(`\\$\\s*${NUM}`));
  if (notional) out.notionalUsdso = Number(notional[1]);

  return out;
}

async function llmExtract(text: string, knownBases: string[]): Promise<Partial<TradeIntent> | undefined> {
  const key = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) return undefined;
  const base = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract a perpetual futures trade from the user's text. Reply with JSON only: " +
            '{"side":"long|short","base":"<one of the listed bases>","notionalUsdso":number,"leverage":number,' +
            '"takeProfitPct":number,"stopLossPct":number}. Omit a field you cannot read. Never invent a base. ' +
            `Bases: ${knownBases.join(", ")}`,
        },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) return undefined;
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  try {
    const j = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
    const out: Partial<TradeIntent> = { raw: text, source: "llm" };
    if (j.side === "long" || j.side === "short") out.side = j.side;
    if (typeof j.base === "string" && knownBases.includes(j.base.toUpperCase())) out.symbol = `${j.base.toUpperCase()}-PERP`;
    for (const k of ["notionalUsdso", "leverage", "takeProfitPct", "stopLossPct"] as const) {
      if (typeof j[k] === "number" && Number.isFinite(j[k]) && j[k] > 0) (out as Record<string, unknown>)[k] = j[k];
    }
    return out;
  } catch {
    return undefined;
  }
}

/** Parse, fall back to the model for missing fields, then apply defaults and validate. */
export async function resolveIntent(text: string, knownBases: string[]): Promise<{ intent?: TradeIntent; problems: string[] }> {
  let p = parseIntent(text, knownBases);
  if (!p.side || !p.symbol || !p.notionalUsdso) {
    const fromLlm = await llmExtract(text, knownBases).catch(() => undefined);
    if (fromLlm) p = { ...fromLlm, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)), source: "llm" };
  }
  const problems: string[] = [];
  if (!p.side) problems.push("say long or short");
  if (!p.symbol) problems.push(`name a market (${knownBases.slice(0, 6).join(", ")}, ...)`);
  if (!p.notionalUsdso) problems.push("give a size in USDso, e.g. 40 usdso");
  if (problems.length) return { problems };

  const intent: TradeIntent = {
    side: p.side!,
    symbol: p.symbol!,
    notionalUsdso: p.notionalUsdso!,
    leverage: p.leverage ?? DEFAULTS.leverage,
    takeProfitPct: p.takeProfitPct ?? DEFAULTS.takeProfitPct,
    stopLossPct: p.stopLossPct ?? DEFAULTS.stopLossPct,
    source: p.source ?? "parser",
    raw: text,
  };
  if (intent.leverage < 1 || intent.leverage > 50) problems.push(`leverage ${intent.leverage}x is outside 1x to 50x`);
  if (intent.stopLossPct <= 0) problems.push("a stop-loss is required");
  if (intent.takeProfitPct <= 0) problems.push("a take-profit is required");
  return problems.length ? { problems } : { intent, problems };
}
