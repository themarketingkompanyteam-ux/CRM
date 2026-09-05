import { EnrichmentAdapter, ProviderCallResult, CreditsInfo } from "../types";
import { timedFetch, classifyStatus, failedResult, scanForContactStrings } from "../http";

// Datagma's exact response field names for findEmail/phone search are not
// fully documented publicly — we call the confirmed endpoints/params and
// defensively scan the response for contact-shaped data rather than
// guessing field names. Confidence is capped lower than schema-confirmed
// providers as a result.
const BASE = "https://gateway.datagma.net/api/ingress";

function apiId(): string {
  const key = process.env.DATAGMA_API_KEY;
  if (!key) throw new Error("DATAGMA_API_KEY is not set");
  return key;
}

export const datagmaAdapter: EnrichmentAdapter = {
  key: "datagma",
  label: "Datagma",
  supportsEmail: true,
  supportsPhone: true,
  configured: !!process.env.DATAGMA_API_KEY,

  async searchContact(input): Promise<ProviderCallResult> {
    const fullName = input.fullName || [input.firstName, input.lastName].filter(Boolean).join(" ");
    const company = input.companyName || input.companyDomain;
    if (!input.firstName || !input.lastName || !company) {
      return { outcome: "NO_MATCH", durationMs: 0, errorMessage: "Datagma requires a first name, last name, and company" };
    }
    try {
      const params = new URLSearchParams({ apiId: apiId(), fullName, company, findEmailV2Step: "3" });
      const { status, text, json, durationMs } = await timedFetch(`${BASE}/v6/findEmail?${params}`, { method: "GET" });
      if (status !== 200) return { outcome: classifyStatus(status, text), errorMessage: text.slice(0, 300), durationMs };

      const { emails } = scanForContactStrings(json);
      if (emails.length === 0) return { outcome: "NO_MATCH", durationMs, creditsUsed: 0 };

      return {
        outcome: "SUCCESS",
        durationMs,
        creditsUsed: 1,
        result: {
          provider: "datagma",
          confidence: 55,
          emails: emails.map((email) => ({ email, confidence: 55 })),
          phones: [],
        },
      };
    } catch (err) {
      return failedResult(err instanceof Error ? err.message : "Unknown error", 0);
    }
  },

  async findPhone(input): Promise<ProviderCallResult> {
    const fullName = input.fullName || [input.firstName, input.lastName].filter(Boolean).join(" ");
    const company = input.companyName || input.companyDomain;
    if (!input.firstName || !input.lastName || !company) {
      return { outcome: "NO_MATCH", durationMs: 0, errorMessage: "Datagma requires a first name, last name, and company" };
    }
    try {
      const params = new URLSearchParams({ apiId: apiId(), fullName, data: company, phoneFull: "true" });
      const { status, text, json, durationMs } = await timedFetch(`${BASE}/v2/full?${params}`, { method: "GET" });
      if (status !== 200) return { outcome: classifyStatus(status, text), errorMessage: text.slice(0, 300), durationMs };

      const { phones } = scanForContactStrings(json);
      if (phones.length === 0) return { outcome: "NO_MATCH", durationMs, creditsUsed: 0 };

      return {
        outcome: "SUCCESS",
        durationMs,
        creditsUsed: 1,
        result: { provider: "datagma", confidence: 50, emails: [], phones: phones.map((phone) => ({ phone, confidence: 50 })) },
      };
    } catch (err) {
      return failedResult(err instanceof Error ? err.message : "Unknown error", 0);
    }
  },

  async getCredits(): Promise<CreditsInfo> {
    try {
      const { status, json } = await timedFetch(`${BASE}/v1/mine?apiId=${apiId()}`, { method: "GET" });
      if (status !== 200) return { remaining: null };
      const body = json as { currentCredit?: number } | null;
      return { remaining: typeof body?.currentCredit === "number" ? body.currentCredit : null };
    } catch {
      return { remaining: null };
    }
  },

  async testConnection() {
    try {
      const { status, text } = await timedFetch(`${BASE}/v1/mine?apiId=${apiId()}`, { method: "GET" });
      if (status === 401 || status === 403) return { ok: false, message: "Invalid API key" };
      if (status !== 200) return { ok: false, message: text.slice(0, 200) || "Connection failed" };
      return { ok: true, message: "Connected" };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
    }
  },
};
