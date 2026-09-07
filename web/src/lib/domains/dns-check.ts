import { Resolver } from "dns/promises";

// The default OS/network resolver on some networks silently blocks or fails raw UDP TXT
// queries (confirmed here) even though MX/A lookups work fine. A dedicated Resolver pointed at
// public DNS avoids that without touching global Node DNS config (which would also affect
// Postgres/Redis hostname resolution elsewhere in the app).
function publicResolver(): Resolver {
  const resolver = new Resolver();
  resolver.setServers(["8.8.8.8", "1.1.1.1"]);
  return resolver;
}

export type DnsCheckStatus = "pass" | "fail" | "unknown";

export type DnsCheckResult = {
  mx: DnsCheckStatus;
  spf: DnsCheckStatus;
  dkim: DnsCheckStatus;
  dmarc: DnsCheckStatus;
  overall: boolean;
  reasons: string[];
};

const LOOKUP_TIMEOUT_MS = 6000;

/** The system resolver can hang far longer than a normal lookup on a bad/unreachable record — never let one query stall the whole check. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("__timeout__")), ms)),
  ]);
}

type Lookup<T> = { ok: true; records: T[] } | { ok: false; reason: string };

/**
 * Distinguishes "no such record" (a genuine, verifiable absence — ENODATA/ENOTFOUND) from a
 * lookup that couldn't be completed at all (timeout, ECONNREFUSED, network restrictions/
 * firewalls that block raw DNS queries). The former is safe to report as a real "fail"; the
 * latter must report "unknown" rather than falsely claiming the record doesn't exist.
 */
async function safeLookup<T>(fn: () => Promise<T[]>): Promise<Lookup<T>> {
  try {
    const records = await withTimeout(fn(), LOOKUP_TIMEOUT_MS);
    return { ok: true, records };
  } catch (e) {
    if (e instanceof Error && e.message === "__timeout__") {
      return { ok: false, reason: "lookup timed out" };
    }
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENODATA" || code === "ENOTFOUND") {
      return { ok: true, records: [] };
    }
    return { ok: false, reason: code ?? (e instanceof Error ? e.message : "lookup failed") };
  }
}

async function txtStrings(resolver: Resolver, hostname: string): Promise<Lookup<string>> {
  const result = await safeLookup(() => resolver.resolveTxt(hostname));
  if (!result.ok) return result;
  return { ok: true, records: result.records.map((chunks) => chunks.join("")) };
}

/**
 * Real DNS lookups only — no fabricated results. DKIM specifically requires a selector to
 * check (there's no way to discover it via DNS alone), so without one we report "unknown"
 * rather than falsely claiming pass or fail. Any query that could not be completed (timeout,
 * connection refused, sandboxed/firewalled network) also reports "unknown", never a false
 * "fail" — an unreachable resolver is not the same thing as a verified missing record.
 */
export async function checkDomain(domain: string, dkimSelector?: string | null): Promise<DnsCheckResult> {
  const reasons: string[] = [];
  const resolver = publicResolver();

  const [mxResult, spfResult, dkimResult, dmarcResult] = await Promise.all([
    safeLookup(() => resolver.resolveMx(domain)),
    txtStrings(resolver, domain),
    dkimSelector ? txtStrings(resolver, `${dkimSelector}._domainkey.${domain}`) : Promise.resolve<Lookup<string>>({ ok: true, records: [] }),
    txtStrings(resolver, `_dmarc.${domain}`),
  ]);

  let mx: DnsCheckStatus;
  if (!mxResult.ok) {
    mx = "unknown";
    reasons.push(`MX lookup could not be completed (${mxResult.reason})`);
  } else {
    mx = mxResult.records.length > 0 ? "pass" : "fail";
    if (mx === "fail") reasons.push("No MX records found");
  }

  let spf: DnsCheckStatus;
  if (!spfResult.ok) {
    spf = "unknown";
    reasons.push(`SPF lookup could not be completed (${spfResult.reason})`);
  } else {
    const spfRecord = spfResult.records.find((r) => r.toLowerCase().startsWith("v=spf1"));
    spf = spfRecord ? "pass" : "fail";
    if (!spfRecord) reasons.push("No SPF (v=spf1) TXT record found at the domain apex");
  }

  let dkim: DnsCheckStatus;
  if (!dkimSelector) {
    dkim = "unknown";
    reasons.push("DKIM selector not configured — cannot verify DKIM without it");
  } else if (!dkimResult.ok) {
    dkim = "unknown";
    reasons.push(`DKIM lookup could not be completed (${dkimResult.reason})`);
  } else {
    const dkimRecord = dkimResult.records.find((r) => r.toLowerCase().includes("v=dkim1"));
    dkim = dkimRecord ? "pass" : "fail";
    if (!dkimRecord) reasons.push(`No DKIM (v=DKIM1) TXT record found at ${dkimSelector}._domainkey.${domain}`);
  }

  let dmarc: DnsCheckStatus;
  if (!dmarcResult.ok) {
    dmarc = "unknown";
    reasons.push(`DMARC lookup could not be completed (${dmarcResult.reason})`);
  } else {
    const dmarcRecord = dmarcResult.records.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
    dmarc = dmarcRecord ? "pass" : "fail";
    if (!dmarcRecord) reasons.push("No DMARC (v=DMARC1) TXT record found at _dmarc." + domain);
  }

  const overall = mx === "pass" && spf === "pass" && dkim === "pass" && dmarc === "pass";
  if (reasons.length === 0) reasons.push("All required authentication records verified.");

  return { mx, spf, dkim, dmarc, overall, reasons };
}
