import { EnrichmentAdapter, ProviderCallResult, CreditsInfo, EnrichmentSearchInput } from "../types";
import { timedFetch, classifyStatus, failedResult } from "../http";

const BASE = "https://app.bettercontact.rocks/api/v2";
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 15; // ~45s max wait — this runs inside the background worker, never in an HTTP request.

function apiKey(): string {
  const key = process.env.BETTERCONTACT_API_KEY;
  if (!key) throw new Error("BETTERCONTACT_API_KEY is not set");
  return key;
}

function headers() {
  return { "X-API-Key": apiKey(), "Content-Type": "application/json" };
}

type BcEmailStatus = "deliverable" | "catch_all" | "catch_all_safe" | "catch_all_not_safe" | "undeliverable" | "not_found";

function confidenceForStatus(status?: BcEmailStatus): number {
  switch (status) {
    case "deliverable":
    case "catch_all_safe":
      return 85;
    case "catch_all":
      return 55;
    case "catch_all_not_safe":
      return 40;
    default:
      return 0;
  }
}

async function enrichAndPoll(input: EnrichmentSearchInput, enrichPhone: boolean): Promise<ProviderCallResult> {
  const lead: Record<string, unknown> = {
    first_name: input.firstName,
    last_name: input.lastName,
  };
  if (input.companyDomain) lead.company_domain = input.companyDomain;
  else if (input.companyName) lead.company = input.companyName;
  if (input.linkedinUrl) lead.linkedin_url = input.linkedinUrl;

  const submit = await timedFetch(`${BASE}/async`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: [lead],
      enrich_email_address: true,
      enrich_phone_number: enrichPhone,
    }),
  });

  if (submit.status !== 201 && submit.status !== 200) {
    return { outcome: classifyStatus(submit.status, submit.text), errorMessage: submit.text.slice(0, 300), durationMs: submit.durationMs };
  }

  const requestId = (submit.json as { id?: string } | null)?.id;
  if (!requestId) return failedResult("BetterContact did not return a request id", submit.durationMs);

  let totalMs = submit.durationMs;
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const poll = await timedFetch(`${BASE}/async/${requestId}`, { headers: headers() });
    totalMs += poll.durationMs;

    if (poll.status !== 200) {
      return { outcome: classifyStatus(poll.status, poll.text), errorMessage: poll.text.slice(0, 300), durationMs: totalMs };
    }

    const body = poll.json as {
      status?: string;
      credits_consumed?: number;
      data?: Array<{
        contact_email_address?: string;
        contact_email_address_status?: BcEmailStatus;
        contact_phone_number?: string;
      }>;
    } | null;

    if (body?.status === "processing") continue;

    const first = body?.data?.[0];
    const emailConfidence = confidenceForStatus(first?.contact_email_address_status);
    const emails = first?.contact_email_address && emailConfidence > 0
      ? [{ email: first.contact_email_address, confidence: emailConfidence, verificationStatus: emailConfidence >= 70 ? ("valid" as const) : ("risky" as const) }]
      : [];
    const phones = first?.contact_phone_number ? [{ phone: first.contact_phone_number, confidence: 70 }] : [];

    if (emails.length === 0 && phones.length === 0) {
      return { outcome: "NO_MATCH", durationMs: totalMs, creditsUsed: body?.credits_consumed ?? 0 };
    }

    return {
      outcome: "SUCCESS",
      durationMs: totalMs,
      creditsUsed: body?.credits_consumed ?? 1,
      result: { provider: "bettercontact", confidence: Math.max(emailConfidence, phones.length ? 70 : 0), emails, phones },
    };
  }

  return failedResult("BetterContact enrichment timed out waiting for a result", totalMs);
}

export const betterContactAdapter: EnrichmentAdapter = {
  key: "bettercontact",
  label: "BetterContact",
  supportsEmail: true,
  supportsPhone: true,
  configured: !!process.env.BETTERCONTACT_API_KEY,

  searchContact: (input) => enrichAndPoll(input, false),
  findPhone: (input) => enrichAndPoll(input, true),

  async getCredits(): Promise<CreditsInfo> {
    try {
      const { status, json } = await timedFetch(`${BASE}/account`, { headers: headers() });
      if (status !== 200) return { remaining: null };
      const body = json as Record<string, unknown> | null;
      const candidate = body?.credits ?? body?.credits_left ?? body?.balance;
      return { remaining: typeof candidate === "number" ? candidate : null };
    } catch {
      return { remaining: null };
    }
  },

  async testConnection() {
    try {
      const { status, text } = await timedFetch(`${BASE}/account`, { headers: headers() });
      if (status === 401) return { ok: false, message: "Invalid API key" };
      if (status !== 200) return { ok: false, message: text.slice(0, 200) || "Connection failed" };
      return { ok: true, message: "Connected" };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
    }
  },
};
