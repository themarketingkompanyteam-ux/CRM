import { AIProvider, AIGenerateResult } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

function model(): string {
  return process.env.GEMINI_MODEL || "gemini-3.6-flash";
}

async function callGemini(body: Record<string, unknown>, attempt = 0): Promise<{
  status: number;
  json: unknown;
  text: string;
}> {
  const res = await fetch(`${BASE}/models/${model()}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  // Exponential backoff on rate limits / transient server errors, up to 3 attempts.
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return callGemini(body, attempt + 1);
  }

  return { status: res.status, json, text };
}

export const geminiProvider: AIProvider = {
  key: "gemini",
  model: model(),

  async generateStructured<T>({
    systemPrompt,
    userPrompt,
    schema,
    useGrounding = false,
  }: {
    systemPrompt: string;
    userPrompt: string;
    schema: object;
    useGrounding?: boolean;
  }): Promise<AIGenerateResult<T>> {
    const start = Date.now();
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    };
    if (useGrounding) {
      body.tools = [{ google_search: {} }];
    }

    async function attemptGenerate(repairHint?: string): Promise<{
      status: number;
      json: unknown;
      text: string;
    }> {
      const reqBody = repairHint
        ? {
            ...body,
            contents: [
              ...(body.contents as unknown[]),
              { role: "user", parts: [{ text: repairHint }] },
            ],
          }
        : body;
      return callGemini(reqBody);
    }

    let { status, json, text } = await attemptGenerate();
    let groundingActuallyUsed = useGrounding;

    // Search grounding requires a billing-enabled Gemini project and returns
    // 429 RESOURCE_EXHAUSTED on accounts without it, even when plain
    // generation works fine. Rather than failing the whole pipeline stage,
    // fall back to the model's own knowledge (clearly weaker research, but
    // keeps the lead moving instead of getting stuck FAILED).
    if (status === 429 && useGrounding && text.includes("RESOURCE_EXHAUSTED")) {
      const bodyWithoutTools = { ...body };
      delete bodyWithoutTools.tools;
      const fallback = await callGemini(bodyWithoutTools);
      status = fallback.status;
      json = fallback.json;
      text = fallback.text;
      groundingActuallyUsed = false;
    }

    const durationMs = Date.now() - start;

    const usageOf = (j: unknown) => {
      const u = (j as { usageMetadata?: Record<string, number> } | null)?.usageMetadata;
      return {
        inputTokens: u?.promptTokenCount ?? null,
        outputTokens: u?.candidatesTokenCount ?? null,
        totalTokens: u?.totalTokenCount ?? null,
      };
    };

    if (status !== 200) {
      return {
        ok: false,
        usage: usageOf(json),
        durationMs,
        errorMessage: text.slice(0, 500),
      };
    }

    function extractText(j: unknown): string | null {
      const candidate = (j as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null)
        ?.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const textPart = parts.find((p) => typeof p.text === "string");
      return textPart?.text ?? null;
    }

    function extractSources(j: unknown): { url: string; title: string }[] {
      const candidate = (j as {
        candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } }>;
      } | null)?.candidates?.[0];
      const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
      return chunks
        .filter((c) => c.web?.uri)
        .map((c) => ({ url: c.web!.uri!, title: c.web!.title ?? c.web!.uri! }));
    }

    let raw = extractText(json);
    let parsed: T | null = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw) as T;
      } catch {
        parsed = null;
      }
    }

    // One repair attempt if the model didn't return valid JSON.
    if (!parsed) {
      const repair = await attemptGenerate(
        "Your previous response was not valid JSON matching the required schema. Reply again with ONLY valid JSON matching the schema, no extra text."
      );
      if (repair.status === 200) {
        raw = extractText(repair.json);
        if (raw) {
          try {
            parsed = JSON.parse(raw) as T;
            json = repair.json;
          } catch {
            parsed = null;
          }
        }
      }
    }

    if (!parsed) {
      return {
        ok: false,
        usage: usageOf(json),
        durationMs: Date.now() - start,
        errorMessage: "Gemini did not return valid JSON matching the schema after retry",
      };
    }

    return {
      ok: true,
      data: parsed,
      usage: usageOf(json),
      durationMs: Date.now() - start,
      sources: groundingActuallyUsed ? extractSources(json) : undefined,
    };
  },

  async testConnection() {
    try {
      const { status, text } = await callGemini({
        contents: [{ role: "user", parts: [{ text: "Reply with the single word: ok" }] }],
      });
      if (status === 401 || status === 403) return { ok: false, message: "Invalid API key" };
      if (status !== 200) return { ok: false, message: text.slice(0, 200) || "Connection failed" };
      return { ok: true, message: "Connected" };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
    }
  },
};
