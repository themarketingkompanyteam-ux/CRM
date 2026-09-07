import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { domains } from "@/db/schema";
import { findOrCreateDomain, runDomainCheck } from "@/lib/domains/service";

export async function GET() {
  const rows = await db
    .select({
      id: domains.id,
      domain: domains.domain,
      status: domains.status,
      dkimSelector: domains.dkimSelector,
      mxStatus: domains.mxStatus,
      spfStatus: domains.spfStatus,
      dkimStatus: domains.dkimStatus,
      dmarcStatus: domains.dmarcStatus,
      checkReasons: domains.checkReasons,
      domainHealthScore: domains.domainHealthScore,
      dnsLastCheckedAt: domains.dnsLastCheckedAt,
      createdAt: domains.createdAt,
      mailboxCount: sql<number>`(SELECT COUNT(*) FROM mailboxes WHERE domain_id = ${domains.id})::int`,
      dailyCapacity: sql<number>`COALESCE((SELECT SUM(CASE WHEN warmup_status = 'warmed' THEN campaign_daily_limit WHEN warmup_status = 'warming' THEN warmup_daily_limit ELSE 0 END) FROM mailboxes WHERE domain_id = ${domains.id}), 0)::int`,
    })
    .from(domains)
    .orderBy(desc(domains.createdAt));
  return NextResponse.json(rows);
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
