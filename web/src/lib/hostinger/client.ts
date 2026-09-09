const BASE = "https://developers.hostinger.com";

export type HostingerDnsRecord = {
  name: string;
  type: string;
  ttl: number;
  records: { content: string; is_disabled?: boolean }[];
};

function apiKey(): string {
  const key = process.env.HOSTINGER_API_TOKEN;
  if (!key) throw new Error("HOSTINGER_API_TOKEN is not set");
  return key;
}

async function hostingerFetch(path: string, init: RequestInit = {}, attempt = 0): Promise<{ status: number; json: unknown }> {
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
    json = text;
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return hostingerFetch(path, init, attempt + 1);
  }
  return { status: res.status, json };
}

export const hostingerClient = {
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!process.env.HOSTINGER_API_TOKEN) return { ok: false, message: "HOSTINGER_API_TOKEN is not set" };
    // No dedicated "whoami" endpoint documented — use a lightweight DNS zone read on a real
    // domain to confirm the token authenticates, without assuming a domain-list endpoint exists.
    const { status } = await hostingerFetch(`/api/domains/v1/portfolio`);
    if (status === 200) return { ok: true, message: "Connected to Hostinger API." };
    if (status === 401 || status === 403) return { ok: false, message: "Invalid or unauthorized Hostinger API token." };
    return { ok: false, message: `Hostinger API returned status ${status}` };
  },

  async listDomains(): Promise<{ domain: string }[]> {
    const { status, json } = await hostingerFetch(`/api/domains/v1/portfolio`);
    if (status !== 200 || !Array.isArray(json)) return [];
    return (json as { domain: string }[]).map((d) => ({ domain: d.domain }));
  },

  async getDnsRecords(domain: string): Promise<HostingerDnsRecord[]> {
    const { status, json } = await hostingerFetch(`/api/dns/v1/zones/${encodeURIComponent(domain)}`);
    if (status !== 200 || !Array.isArray(json)) return [];
    return json as HostingerDnsRecord[];
  },

  /**
   * Adds/updates records without touching unrelated ones (overwrite: false merges by
   * name+type rather than replacing the whole zone) — never wipe a domain's existing records
   * (like its A/CNAME) just because we're adding an MX or TXT entry.
   */
  async upsertDnsRecords(domain: string, records: { name: string; type: string; ttl: number; content: string }[]) {
    const body = {
      overwrite: false,
      zone: records.map((r) => ({
        name: r.name,
        type: r.type,
        ttl: r.ttl,
        records: [{ content: r.content }],
      })),
    };
    const { status, json } = await hostingerFetch(`/api/dns/v1/zones/${encodeURIComponent(domain)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (status !== 200 && status !== 204) {
      throw new Error(`Hostinger DNS update failed (${status}): ${JSON.stringify(json).slice(0, 400)}`);
    }
    return { ok: true };
  },
};
