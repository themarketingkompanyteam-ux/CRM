import { EnrichmentAdapter, ProviderCallResult, EnrichmentSearchInput, CreditsInfo } from "../types";
import { timedFetch, classifyStatus, failedResult } from "../http";

const BASE = "https://api.prospeo.io";

function apiKey(): string {
  const key = process.env.PROSPEO_API_KEY;
  if (!key) throw new Error("PROSPEO_API_KEY is not set");
  return key;
}

async function callEnrichPerson(input: EnrichmentSearchInput, enrichMobile: boolean) {
  const data: Record<string, unknown> = {};
  if (input.linkedinUrl) {
    data.linkedin_url = input.linkedinUrl;
  } else if (input.email) {
    data.email = input.email;
  } else {
    data.first_name = input.firstName;
    data.last_name = input.lastName;
    if (input.companyDomain) data.company_website = input.companyDomain;
    else if (input.companyName) data.company_name = input.companyName;
  }

  return timedFetch(`${BASE}/enrich-person`, {
    method: "POST",
    headers: { "X-KEY": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ data, enrich_mobile: enrichMobile }),
  });
}

export const prospeoAdapter: EnrichmentAdapter = {
  key: "prospeo",
  label: "Prospeo",
  supportsEmail: true,
  supportsPhone: true,
  configured: !!process.env.PROSPEO_API_KEY,

  async searchContact(input): Promise<ProviderCallResult> {
    try {
      const { status, text, json, durationMs } = await callEnrichPerson(input, false);
      if (status !== 200) return { outcome: classifyStatus(status, text), errorMessage: text.slice(0, 300), durationMs };

      const person = (json as { person?: Record<string, unknown> } | null)?.person;
      const email = person?.email as { status?: string; email?: string } | undefined;
      if (!email?.email || email.status !== "VERIFIED") {
        return { outcome: "NO_MATCH", durationMs, creditsUsed: 0 };
      }

      return {
        outcome: "SUCCESS",
        durationMs,
        creditsUsed: 1,
        result: {
          firstName: person?.first_name as string | undefined,
          lastName: person?.last_name as string | undefined,
          provider: "prospeo",
          confidence: 90,
          emails: [{ email: email.email, confidence: 90, verificationStatus: "valid" }],
          phones: [],
        },
      };
    } catch (err) {
      return failedResult(err instanceof Error ? err.message : "Unknown error", 0);
    }
  },

  async findPhone(input): Promise<ProviderCallResult> {
    try {
      const { status, text, json, durationMs } = await callEnrichPerson(input, true);
      if (status !== 200) return { outcome: classifyStatus(status, text), errorMessage: text.slice(0, 300), durationMs };

      const person = (json as { person?: Record<string, unknown> } | null)?.person;
      const mobile = person?.mobile as { status?: string; mobile?: string } | undefined;
      if (!mobile?.mobile || mobile.status !== "VERIFIED") {
        return { outcome: "NO_MATCH", durationMs, creditsUsed: 0 };
      }

      return {
        outcome: "SUCCESS",
        durationMs,
        creditsUsed: 10,
        result: {
          provider: "prospeo",
          confidence: 85,
          emails: [],
          phones: [{ phone: mobile.mobile, confidence: 85 }],
        },
      };
    } catch (err) {
      return failedResult(err instanceof Error ? err.message : "Unknown error", 0);
    }
  },

  async getCredits(): Promise<CreditsInfo> {
    // Prospeo's account/credits endpoint path is not publicly confirmed as of
    // writing — rather than guess a path, we report balance as unavailable.
    return { remaining: null };
  },

  async testConnection() {
    // Prospeo rejects placeholder-looking payloads ("Test"/"example.com") with
    // a data-validation error rather than an auth error, so we test with a
    // real, well-known public figure instead — verifies auth + request shape.
    const result = await this.searchContact({ firstName: "Satya", lastName: "Nadella", companyDomain: "microsoft.com" });
    if (result.outcome === "AUTH_ERROR") return { ok: false, message: "Invalid API key" };
    if (result.outcome === "FAILED") return { ok: false, message: result.errorMessage ?? "Connection failed" };
    return { ok: true, message: "Connected" };
  },
};
