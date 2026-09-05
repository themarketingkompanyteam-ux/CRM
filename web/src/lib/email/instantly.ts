import {
  EmailProvider,
  EmailAccount,
  RemoteCampaign,
  CreateCampaignParams,
  CampaignAnalytics,
  AddLeadParams,
  AddLeadsResult,
} from "./types";

const BASE = "https://api.instantly.ai/api/v2";

const STATUS_LABELS: Record<number, string> = {
  1: "Active",
  2: "Paused",
  3: "Maintenance",
  [-1]: "Connection Error",
  [-2]: "Soft Bounce",
  [-3]: "Sending Error",
};

function apiKey(): string {
  const key = process.env.INSTANTLY_API_KEY;
  if (!key) throw new Error("INSTANTLY_API_KEY is not set");
  return key;
}

async function instantlyFetch(path: string, init: RequestInit = {}, attempt = 0): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return instantlyFetch(path, init, attempt + 1);
  }
  return { status: res.status, json };
}

type RemoteAccount = {
  email: string;
  status: number | null;
  warmup_status: number | null;
  daily_limit: number | null;
  tags: { id: string; label: string }[] | null;
};

type RemoteCampaignRaw = {
  id: string;
  name: string;
  status: number;
  timestamp_created: string;
};

/** Registers (or re-registers) our webhook receiver with a shared-secret header, since Instantly does not sign payloads. */
export async function registerInstantlyWebhook(targetUrl: string, secret: string) {
  const { status, json } = await instantlyFetch("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      target_hook_url: targetUrl,
      event_type: "all_events",
      name: "CRM sync",
      headers: { "X-Webhook-Secret": secret },
    }),
  });
  if (status !== 200 && status !== 201) {
    throw new Error(`Failed to register Instantly webhook (${status}): ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json as { id: string };
}

export async function listInstantlyWebhooks() {
  const { status, json } = await instantlyFetch("/webhooks?limit=50");
  if (status !== 200 || !json || typeof json !== "object") return [];
  return ((json as { items?: { id: string; target_hook_url: string; name: string }[] }).items ?? []);
}

export const instantlyProvider: EmailProvider = {
  key: "instantly",

  async testConnection() {
    const { status, json } = await instantlyFetch("/accounts?limit=1");
    if (status === 200) return { ok: true, message: "Connected to Instantly API v2." };
    if (status === 401 || status === 403) return { ok: false, message: "Invalid or unauthorized Instantly API key." };
    return { ok: false, message: `Instantly API error (status ${status}): ${JSON.stringify(json).slice(0, 200)}` };
  },

  async listAccounts(): Promise<EmailAccount[]> {
    const accounts: EmailAccount[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < 20; page++) {
      const qs = new URLSearchParams({ limit: "100" });
      if (startingAfter) qs.set("starting_after", startingAfter);
      const { status, json } = await instantlyFetch(`/accounts?${qs.toString()}`);
      if (status !== 200 || !json || typeof json !== "object") break;
      const body = json as { items?: RemoteAccount[]; next_starting_after?: string | null };
      const items = body.items ?? [];
      for (const a of items) {
        accounts.push({
          email: a.email,
          status: (a.status ?? null) as EmailAccount["status"],
          statusLabel: a.status != null ? STATUS_LABELS[a.status] ?? String(a.status) : "Unknown",
          warmupStatus: a.warmup_status ?? null,
          dailyLimit: a.daily_limit ?? null,
          tags: (a.tags ?? []).map((t) => t.label),
        });
      }
      if (!body.next_starting_after || items.length === 0) break;
      startingAfter = body.next_starting_after;
    }
    return accounts;
  },

  async listCampaigns(): Promise<RemoteCampaign[]> {
    const { status, json } = await instantlyFetch("/campaigns?limit=100");
    if (status !== 200 || !json || typeof json !== "object") return [];
    const body = json as { items?: RemoteCampaignRaw[] };
    return (body.items ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      timestampCreated: c.timestamp_created,
    }));
  },

  async getCampaign(id: string): Promise<RemoteCampaign | null> {
    const { status, json } = await instantlyFetch(`/campaigns/${id}`);
    if (status !== 200 || !json) return null;
    const c = json as RemoteCampaignRaw;
    return { id: c.id, name: c.name, status: c.status, timestampCreated: c.timestamp_created };
  },

  async createCampaign(params: CreateCampaignParams): Promise<RemoteCampaign> {
    const body = {
      name: params.name,
      campaign_schedule: {
        schedules: [
          {
            name: "Default",
            timing: { from: params.schedule.from, to: params.schedule.to },
            days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, params.schedule.days.includes(d)])),
            timezone: params.schedule.timezone,
          },
        ],
      },
      sequences: [
        {
          steps: params.steps.map((s) => ({
            type: "email",
            delay: s.delayDays,
            delay_unit: "days",
            variants: [{ subject: s.subject, body: s.body }],
          })),
        },
      ],
      email_list: params.sendingAccountEmails,
      daily_limit: params.dailyLimit,
      stop_on_reply: params.stopOnReply,
      open_tracking: params.openTracking,
      link_tracking: params.linkTracking,
    };
    const { status, json } = await instantlyFetch("/campaigns", { method: "POST", body: JSON.stringify(body) });
    if (status !== 200 && status !== 201) {
      throw new Error(`Instantly createCampaign failed (${status}): ${JSON.stringify(json).slice(0, 500)}`);
    }
    const c = json as RemoteCampaignRaw;
    return { id: c.id, name: c.name, status: c.status, timestampCreated: c.timestamp_created };
  },

  async updateCampaign(id: string, params: Partial<CreateCampaignParams>): Promise<void> {
    const body: Record<string, unknown> = {};
    if (params.dailyLimit !== undefined) body.daily_limit = params.dailyLimit;
    if (params.stopOnReply !== undefined) body.stop_on_reply = params.stopOnReply;
    if (params.openTracking !== undefined) body.open_tracking = params.openTracking;
    if (params.linkTracking !== undefined) body.link_tracking = params.linkTracking;
    if (params.sendingAccountEmails !== undefined) body.email_list = params.sendingAccountEmails;
    const { status, json } = await instantlyFetch(`/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    if (status !== 200) throw new Error(`Instantly updateCampaign failed (${status}): ${JSON.stringify(json).slice(0, 500)}`);
  },

  async pauseCampaign(id: string): Promise<void> {
    const { status, json } = await instantlyFetch(`/campaigns/${id}/pause`, { method: "POST" });
    if (status !== 200) throw new Error(`Instantly pauseCampaign failed (${status}): ${JSON.stringify(json).slice(0, 500)}`);
  },

  async resumeCampaign(id: string): Promise<void> {
    const { status, json } = await instantlyFetch(`/campaigns/${id}/activate`, { method: "POST" });
    if (status !== 200) throw new Error(`Instantly resumeCampaign failed (${status}): ${JSON.stringify(json).slice(0, 500)}`);
  },

  async deleteCampaign(id: string): Promise<void> {
    const { status, json } = await instantlyFetch(`/campaigns/${id}`, { method: "DELETE" });
    if (status !== 200 && status !== 204) {
      throw new Error(`Instantly deleteCampaign failed (${status}): ${JSON.stringify(json).slice(0, 500)}`);
    }
  },

  async addLeads(campaignId: string, leads: AddLeadParams[]): Promise<AddLeadsResult> {
    const body = {
      campaign_id: campaignId,
      leads: leads.map((l) => ({
        email: l.email,
        first_name: l.firstName,
        last_name: l.lastName,
        company_name: l.companyName,
        job_title: l.jobTitle,
        website: l.website,
        custom_variables: l.customVariables ?? {},
      })),
      skip_if_in_campaign: true,
      skip_if_in_workspace: false,
      verify_leads_on_import: false,
    };
    const { status, json } = await instantlyFetch("/leads/bulk-add", { method: "POST", body: JSON.stringify(body) });
    if (status !== 200 && status !== 201) {
      throw new Error(`Instantly addLeads failed (${status}): ${JSON.stringify(json).slice(0, 500)}`);
    }
    const b = json as {
      total_sent?: number;
      leads_uploaded?: number;
      duplicate_email_count?: number;
      invalid_email_count?: number;
      in_blocklist?: number;
      created_leads?: { id: string; email: string | null; index: number }[];
    };
    return {
      totalSent: b.total_sent ?? leads.length,
      leadsUploaded: b.leads_uploaded ?? 0,
      duplicateEmailCount: b.duplicate_email_count ?? 0,
      invalidEmailCount: b.invalid_email_count ?? 0,
      inBlocklist: b.in_blocklist ?? 0,
      createdLeads: b.created_leads ?? [],
    };
  },

  async getCampaignAnalytics(id: string): Promise<CampaignAnalytics | null> {
    const { status, json } = await instantlyFetch(`/campaigns/analytics?id=${id}`);
    if (status !== 200 || !json) return null;
    const arr = Array.isArray(json) ? json : [json];
    const a = arr[0] as Record<string, number> | undefined;
    if (!a) return null;
    return {
      campaignId: id,
      leadsCount: a.leads_count ?? 0,
      sent: a.emails_sent_count ?? a.sent ?? 0,
      opened: a.open_count ?? a.opened ?? 0,
      clicked: a.link_click_count ?? a.clicked ?? 0,
      replied: a.reply_count ?? a.replied ?? 0,
      bounced: a.bounced_count ?? a.bounced ?? 0,
      unsubscribed: a.unsubscribed_count ?? a.unsubscribed ?? 0,
    };
  },

  async sendTestEmail(to: string, subject: string, body: string): Promise<{ ok: boolean; message: string }> {
    const { status, json } = await instantlyFetch("/emails/test", {
      method: "POST",
      body: JSON.stringify({ to, subject, body }),
    });
    if (status === 200 || status === 201) return { ok: true, message: "Test email sent." };
    return { ok: false, message: `Failed to send test email (${status}): ${JSON.stringify(json).slice(0, 300)}` };
  },
};
