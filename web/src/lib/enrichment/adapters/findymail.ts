import { EnrichmentAdapter, ProviderCallResult, CreditsInfo } from "../types";
import { timedFetch, classifyStatus, failedResult } from "../http";

const BASE = "https://app.findymail.com/api";

function token(): string {
  const key = process.env.FINDYMAIL_API_KEY;
  if (!key) throw new Error("FINDYMAIL_API_KEY is not set");
  return key;
}

function authHeaders() {
  return { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
}

export const findymailAdapter: EnrichmentAdapter = {
  key: "findymail",
  label: "Findymail",
  supportsEmail: true,
  supportsPhone: true,
  configured: !!process.env.FINDYMAIL_API_KEY,

  async searchContact(input): Promise<ProviderCallResult> {
    const domain = input.companyDomain;
    const name = input.fullName || [input.firstName, input.lastName].filter(Boolean).join(" ");
    if (!domain || !name) {
      return { outcome: "NO_MATCH", durationMs: 0, errorMessage: "Findymail requires a name and company domain" };
    }
    try {
      const { status, text, json, durationMs } = await timedFetch(`${BASE}/search/name`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name, domain }),
      });
      if (status !== 200) return { outcome: classifyStatus(status, text), errorMessage: text.slice(0, 300), durationMs };

      const contact = (json as { contact?: { email?: string; name?: string } } | null)?.contact;
      if (!contact?.email) return { outcome: "NO_MATCH", durationMs, creditsUsed: 0 };

      return {
        outcome: "SUCCESS",
        durationMs,
        creditsUsed: 1,
        result: {
          fullName: contact.name,
          provider: "findymail",
          confidence: 80,
          emails: [{ email: contact.email, confidence: 80 }],
          phones: [],
        },
      };
    } catch (err) {
      return failedResult(err instanceof Error ? err.message : "Unknown error", 0);
    }
  },

  async findPhone(input): Promise<ProviderCallResult> {
    if (!input.linkedinUrl) {
      return { outcome: "NO_MATCH", durationMs: 0, errorMessage: "Findymail phone search requires a LinkedIn URL" };
    }
    try {
      const { status, text, json, durationMs } = await timedFetch(`${BASE}/search/phone`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ linkedin_url: input.linkedinUrl }),
      });
      if (status !== 200) return { outcome: classifyStatus(status, text), errorMessage: text.slice(0, 300), durationMs };

      const phone = (json as { phone?: string } | null)?.phone;
      if (!phone) return { outcome: "NO_MATCH", durationMs, creditsUsed: 0 };

      return {
        outcome: "SUCCESS",
        durationMs,
        creditsUsed: 10,
        result: { provider: "findymail", confidence: 75, emails: [], phones: [{ phone, confidence: 75 }] },
      };
    } catch (err) {
      return failedResult(err instanceof Error ? err.message : "Unknown error", 0);
    }
  },

  async verifyEmail(email: string): Promise<ProviderCallResult> {
    try {
      const { status, text, json, durationMs } = await timedFetch(`${BASE}/verify`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email }),
      });
      if (status !== 200) return { outcome: classifyStatus(status, text), errorMessage: text.slice(0, 300), durationMs };

      const body = json as { verified?: boolean } | null;
      return {
        outcome: "SUCCESS",
        durationMs,
        creditsUsed: 1,
        result: {
          provider: "findymail",
          confidence: body?.verified ? 95 : 30,
          emails: [{ email, confidence: body?.verified ? 95 : 30, verificationStatus: body?.verified ? "valid" : "invalid" }],
          phones: [],
        },
      };
    } catch (err) {
      return failedResult(err instanceof Error ? err.message : "Unknown error", 0);
    }
  },

  async getCredits(): Promise<CreditsInfo> {
    try {
      const { status, json } = await timedFetch(`${BASE}/credits`, { headers: authHeaders() });
      if (status !== 200) return { remaining: null };
      const body = json as { credits?: number } | null;
      return { remaining: typeof body?.credits === "number" ? body.credits : null };
    } catch {
      return { remaining: null };
    }
  },

  async testConnection() {
    const credits = await this.getCredits();
    if (credits.remaining === null) {
      try {
        const { status } = await timedFetch(`${BASE}/credits`, { headers: authHeaders() });
        if (status === 401) return { ok: false, message: "Invalid API token" };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
      }
    }
    return { ok: true, message: "Connected" };
  },
};
