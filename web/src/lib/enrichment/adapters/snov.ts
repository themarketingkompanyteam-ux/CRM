import { EnrichmentAdapter, ProviderCallResult, CreditsInfo } from "../types";
import { timedFetch, classifyStatus, failedResult } from "../http";

const BASE = "https://api.snov.io";
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 10;

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const clientId = process.env.SNOV_API_USER_ID;
  const clientSecret = process.env.SNOV_API_SECRET;
  if (!clientId || !clientSecret) throw new Error("SNOV_API_USER_ID / SNOV_API_SECRET is not set");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(`${BASE}/v1/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Snov.io token request failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return cachedToken.value;
}

export const snovAdapter: EnrichmentAdapter = {
  key: "snov",
  label: "Snov.io",
  supportsEmail: true,
  supportsPhone: false,
  configured: !!(process.env.SNOV_API_USER_ID && process.env.SNOV_API_SECRET),

  async searchContact(input): Promise<ProviderCallResult> {
    const domain = input.companyDomain;
    if (!domain || !input.firstName || !input.lastName) {
      return { outcome: "NO_MATCH", durationMs: 0, errorMessage: "Snov.io requires first name, last name, and company domain" };
    }
    try {
      const token = await getAccessToken();
      const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

      const start = await timedFetch(`${BASE}/v2/emails-by-domain-by-name/start`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ rows: [{ first_name: input.firstName, last_name: input.lastName, domain }] }),
      });
      if (start.status !== 200) return { outcome: classifyStatus(start.status, start.text), errorMessage: start.text.slice(0, 300), durationMs: start.durationMs };

      const taskId =
        (start.json as Record<string, unknown> | null)?.task_hash ??
        (start.json as Record<string, unknown> | null)?.hash ??
        (start.json as Record<string, unknown> | null)?.id;
      if (!taskId) return failedResult("Snov.io did not return a task identifier", start.durationMs);

      let totalMs = start.durationMs;
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const poll = await timedFetch(
          `${BASE}/v2/emails-by-domain-by-name/result?task_hash=${encodeURIComponent(String(taskId))}`,
          { headers: authHeaders }
        );
        totalMs += poll.durationMs;
        if (poll.status !== 200) continue;

        const results = (poll.json as { data?: Array<{ email?: string; smtp_status?: string }> } | null)?.data;
        if (!results || results.length === 0) continue; // still processing

        const found = results.find((r) => r.email);
        if (!found?.email) return { outcome: "NO_MATCH", durationMs: totalMs, creditsUsed: 0 };

        const confidence = found.smtp_status === "valid" ? 85 : found.smtp_status === "unknown" ? 50 : 0;
        if (confidence === 0) return { outcome: "NO_MATCH", durationMs: totalMs, creditsUsed: 1 };

        return {
          outcome: "SUCCESS",
          durationMs: totalMs,
          creditsUsed: 1,
          result: {
            provider: "snov",
            confidence,
            emails: [{ email: found.email, confidence, verificationStatus: found.smtp_status === "valid" ? "valid" : "unknown" }],
            phones: [],
          },
        };
      }
      return failedResult("Snov.io search timed out waiting for a result", totalMs);
    } catch (err) {
      return failedResult(err instanceof Error ? err.message : "Unknown error", 0);
    }
  },

  async getCredits(): Promise<CreditsInfo> {
    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };
      for (const path of ["/v1/get-balance", "/v1/check-user-balance"]) {
        const { status, json } = await timedFetch(`${BASE}${path}`, { headers });
        if (status === 200) {
          const body = json as Record<string, unknown> | null;
          const candidate = body?.balance ?? body?.credits;
          if (typeof candidate === "number") return { remaining: candidate };
        }
      }
      return { remaining: null };
    } catch {
      return { remaining: null };
    }
  },

  async testConnection() {
    try {
      await getAccessToken();
      return { ok: true, message: "Connected" };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
    }
  },
};
