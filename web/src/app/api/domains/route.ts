import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { domains } from "@/db/schema";
import { findOrCreateDomain, runDomainCheck } from "@/lib/domains/service";

type DomainRow = {
  id: number;
  domain: string;
  status: string;
  dkim_selector: string | null;
  dkim_optional: number;
  mx_status: string;
  spf_status: string;
  dkim_status: string;
  dmarc_status: string;
  check_reasons: string[];
  domain_health_score: number;
  dns_last_checked_at: string | null;
  created_at: string;
  mailbox_count: number;
  daily_capacity: number;
};

export async function GET() {
  // Raw query with explicitly table-qualified columns — drizzle's query builder mis-scopes a
  // drizzle column object (${domains.id}) interpolated inside a correlated subquery's sql
  // template, silently returning 0 instead of the real count (same bug class fixed earlier
  // for the companies contact-count; see project history).
  const rows = await db.execute<DomainRow>(sql`
    SELECT
      d.id, d.domain, d.status, d.dkim_selector, d.dkim_optional, d.mx_status, d.spf_status, d.dkim_status, d.dmarc_status,
      d.check_reasons, d.domain_health_score, d.dns_last_checked_at, d.created_at,
      (SELECT COUNT(*) FROM mailboxes WHERE mailboxes.domain_id = d.id)::int AS mailbox_count,
      COALESCE((
        SELECT SUM(CASE WHEN warmup_status = 'warmed' THEN campaign_daily_limit WHEN warmup_status = 'warming' THEN warmup_daily_limit ELSE 0 END)
        FROM mailboxes WHERE mailboxes.domain_id = d.id
      ), 0)::int AS daily_capacity
    FROM domains d
    ORDER BY d.created_at DESC
  `);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      domain: r.domain,
      status: r.status,
      dkimSelector: r.dkim_selector,
      dkimOptional: r.dkim_optional,
      mxStatus: r.mx_status,
      spfStatus: r.spf_status,
      dkimStatus: r.dkim_status,
      dmarcStatus: r.dmarc_status,
      checkReasons: r.check_reasons,
      domainHealthScore: r.domain_health_score,
      dnsLastCheckedAt: r.dns_last_checked_at,
      createdAt: r.created_at,
      mailboxCount: r.mailbox_count,
      dailyCapacity: r.daily_capacity,
    }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const domainName: string = (body.domain || "").trim().toLowerCase();
  if (!domainName || !domainName.includes(".")) {
    return NextResponse.json({ error: "A valid domain (e.g. example.com) is required" }, { status: 400 });
  }

  const created = await findOrCreateDomain(domainName);
  if (body.dkimSelector) {
    await db.update(domains).set({ dkimSelector: body.dkimSelector }).where(eq(domains.id, created.id));
  }
  const checked = await runDomainCheck(created.id);
  return NextResponse.json(checked ?? created);
}
