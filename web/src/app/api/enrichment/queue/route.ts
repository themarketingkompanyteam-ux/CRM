import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { enrichmentQueue } from "@/db/schema";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const rows = await db.execute<{
    id: number;
    contact_id: number;
    status: string;
    source: string | null;
    last_provider: string | null;
    last_error: string | null;
    first_name: string;
    last_name: string | null;
    company_name: string | null;
    company_domain: string | null;
    linkedin_url: string | null;
    email: string | null;
    phone: string | null;
    lead_status: string;
    created_at: string;
  }>(sql`
    SELECT q.id, q.contact_id, q.status, q.source, q.last_provider, q.last_error,
           c.first_name, c.last_name, co.name AS company_name, c.company_domain,
           c.linkedin_url, c.email, c.phone, c.lead_status, q.created_at
    FROM enrichment_queue q
    JOIN contacts c ON c.id = q.contact_id
    LEFT JOIN companies co ON co.id = c.company_id
    ${status ? sql`WHERE q.status = ${status}` : sql``}
    ORDER BY q.created_at DESC
    LIMIT 500
  `);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      contactId: r.contact_id,
      status: r.status,
      source: r.source,
      lastProvider: r.last_provider,
      lastError: r.last_error,
      name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
      companyName: r.company_name,
      companyDomain: r.company_domain,
      linkedinUrl: r.linkedin_url,
      email: r.email,
      phone: r.phone,
      leadStatus: r.lead_status,
      createdAt: r.created_at,
    }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const contactIds: number[] = Array.isArray(body.contactIds) ? body.contactIds.map(Number) : [];
  const source: string = body.source ?? "manual";

  if (contactIds.length === 0) {
    return NextResponse.json({ error: "contactIds is required" }, { status: 400 });
  }

  let queued = 0;
  for (const contactId of contactIds) {
    const [row] = await db
      .insert(enrichmentQueue)
      .values({ contactId, status: "QUEUED", source })
      .onConflictDoUpdate({
        target: enrichmentQueue.contactId,
        set: { status: "QUEUED", source, updatedAt: new Date() },
      })
      .returning();
    if (row) queued++;
  }

  return NextResponse.json({ status: "queued", count: queued });
}
