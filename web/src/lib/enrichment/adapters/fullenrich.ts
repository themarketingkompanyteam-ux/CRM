import { EnrichmentAdapter, ProviderCallResult, CreditsInfo } from "../types";
import { timedFetch, classifyStatus, failedResult, scanForContactStrings } from "../http";

// FullEnrich's exact bulk-enrich request/response field names are not fully
// exposed in their public docs at time of writing — we submit with the
// commonly-documented shape and defensively scan the polled response for
// contact-shaped data rather than asserting specific field names.
const BASE = "https://app.fullenrich.com/api/v2";
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 12;

function apiKey(): string {
  const key = process.env.FULLENRICH_API_KEY;
  if (!key) throw new Error("FULLENRICH_API_KEY is not set");
  return key;
}

function headers() {
  return { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" };
}

export const fullEnrichAdapter: EnrichmentAdapter = {
  key: "fullenrich",
  label: "FullEnrich",
  supportsEmail: true,
  supportsPhone: true,
  configured: !!process.env.FULLENRICH_API_KEY,

  async searchContact(input): Promise<ProviderCallResult> {
    try {
      const contact: Record<string, unknown> = {
        firstname: input.firstName,
        lastname: input.lastName,
      };
      if (input.companyDomain) contact.domain = input.companyDomain;
      if (input.companyName) contact.company_name = input.companyName;
      if (input.linkedinUrl) contact.linkedin_url = input.linkedinUrl;

      const submit = await timedFetch(`${BASE}/contact/enrich/bulk`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ name: `crm-${Date.now()}`, data: [contact] }),
      });
      if (submit.status !== 200 && submit.status !== 201) {
        return { outcome: classifyStatus(submit.status, submit.text), errorMessage: submit.text.slice(0, 300), durationMs: submit.durationMs };
      }

      const enrichmentId =
        (submit.json as Record<string, unknown> | null)?.enrichment_id ??
        (submit.json as Record<string, unknown> | null)?.id;
      if (!enrichmentId) return failedResult("FullEnrich did not return an enrichment id", submit.durationMs);

      let totalMs = submit.durationMs;
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const poll = await timedFetch(`${BASE}/contact/enrich/bulk?enrichment_id=${encodeURIComponent(String(enrichmentId))}`, {
          headers: headers(),
        });
        totalMs += poll.durationMs;
        if (poll.status !== 200) continue;

        const { emails, phones } = scanForContactStrings(poll.json);
        if (emails.length === 0 && phones.length === 0) {
          const statusStr = JSON.stringify(poll.json).toLowerCase();
          if (statusStr.includes("processing") || statusStr.includes("pending")) continue;
          return { outcome: "NO_MATCH", durationMs: totalMs, creditsUsed: 0 };
        }

        return {
          outcome: "SUCCESS",
          durationMs: totalMs,
          creditsUsed: 1,
          result: {
            provider: "fullenrich",
            confidence: 55,
            emails: emails.map((email) => ({ email, confidence: 55 })),
            phones: phones.map((phone) => ({ phone, confidence: 55 })),
          },
        };
      }
      return failedResult("FullEnrich enrichment timed out waiting for a result", totalMs);
    } catch (err) {
      return failedResult(err instanceof Error ? err.message : "Unknown error", 0);
    }
  },

  async getCredits(): Promise<CreditsInfo> {
    try {
      const { status, json } = await timedFetch(`${BASE}/account/credits`, { headers: headers() });
      if (status !== 200) return { remaining: null };
      const body = json as Record<string, unknown> | null;
      const candidate = body?.credits ?? body?.balance ?? body?.remaining;
      return { remaining: typeof candidate === "number" ? candidate : null };
    } catch {
      return { remaining: null };
    }
  },

  async testConnection() {
    try {
      const { status, text } = await timedFetch(`${BASE}/account/keys/verify`, { headers: headers() });
      if (status === 401 || status === 403) return { ok: false, message: "Invalid API key" };
      if (status !== 200) return { ok: false, message: text.slice(0, 200) || "Connection failed" };
      return { ok: true, message: "Connected" };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
    }
  },
};
