import { eq } from "drizzle-orm";
import { db } from "@/db";
import { domains } from "@/db/schema";
import { checkDomain, DnsCheckStatus } from "./dns-check";

function scoreFor(mx: DnsCheckStatus, spf: DnsCheckStatus, dkim: DnsCheckStatus, dmarc: DnsCheckStatus): number {
  // Each required record is worth 25. "unknown" (e.g. DKIM with no selector configured) scores
  // as a partial miss rather than a hard fail, since we genuinely can't verify it either way.
  const points = (s: DnsCheckStatus) => (s === "pass" ? 25 : s === "unknown" ? 10 : 0);
  return points(mx) + points(spf) + points(dkim) + points(dmarc);
}

export async function findOrCreateDomain(domainName: string) {
  const [existing] = await db.select().from(domains).where(eq(domains.domain, domainName)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(domains).values({ domain: domainName }).returning();
  return created;
}

export async function runDomainCheck(domainId: number) {
  const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
  if (!domain) return null;

  const result = await checkDomain(domain.domain, domain.dkimSelector);
  const score = scoreFor(result.mx, result.spf, result.dkim, result.dmarc);

  const [updated] = await db
    .update(domains)
    .set({
      mxStatus: result.mx,
      spfStatus: result.spf,
      dkimStatus: result.dkim,
      dmarcStatus: result.dmarc,
      checkReasons: result.reasons,
      domainHealthScore: score,
      dnsLastCheckedAt: new Date(),
    })
    .where(eq(domains.id, domainId))
    .returning();

  return updated;
}

/** The compliance gate: a mailbox may only warm up or send if its domain has verified MX/SPF/DKIM/DMARC. */
export function domainPassesComplianceGate(domain: { mxStatus: string; spfStatus: string; dkimStatus: string; dmarcStatus: string } | null): boolean {
  if (!domain) return false;
  return domain.mxStatus === "pass" && domain.spfStatus === "pass" && domain.dkimStatus === "pass" && domain.dmarcStatus === "pass";
}
