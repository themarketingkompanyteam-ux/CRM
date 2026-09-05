import type { ProviderCallResult, ProviderOutcome } from "./types";

export function classifyStatus(status: number, bodyText: string): ProviderOutcome {
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (
    status === 402 ||
    lower.includes("insufficient credit") ||
    lower.includes("not_enough_credit") ||
    lower.includes("out of credit") ||
    lower.includes("no credits")
  ) {
    return "OUT_OF_CREDITS";
  }
  if (status >= 200 && status < 300) return "SUCCESS";
  return "FAILED";
}

export async function timedFetch(
  url: string,
  init: RequestInit
): Promise<{ status: number; text: string; json: unknown; durationMs: number }> {
  const start = Date.now();
  const res = await fetch(url, init);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, text, json, durationMs: Date.now() - start };
}

export function failedResult(errorMessage: string, durationMs: number): ProviderCallResult {
  return { outcome: "FAILED", errorMessage, durationMs };
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /\+?[0-9][0-9\s().-]{7,}[0-9]/g;

/**
 * Defensive fallback for providers whose exact response schema isn't fully
 * documented (Datagma, Snov.io, FullEnrich at time of writing). Recursively
 * scans the JSON for email/phone-shaped strings instead of guessing field
 * names. Confidence is intentionally capped lower than confirmed-schema
 * providers since the match isn't structurally verified.
 */
export function scanForContactStrings(value: unknown): { emails: string[]; phones: string[] } {
  const emails = new Set<string>();
  const phones = new Set<string>();

  function walk(v: unknown) {
    if (typeof v === "string") {
      for (const m of v.match(EMAIL_RE) ?? []) emails.add(m);
      for (const m of v.match(PHONE_RE) ?? []) {
        const digits = m.replace(/[^0-9]/g, "");
        if (digits.length >= 8 && digits.length <= 15) phones.add(m.trim());
      }
    } else if (Array.isArray(v)) {
      for (const item of v) walk(item);
    } else if (v && typeof v === "object") {
      for (const val of Object.values(v)) walk(val);
    }
  }

  walk(value);
  return { emails: [...emails], phones: [...phones] };
}
