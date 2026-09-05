import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { companySchema } from "@/lib/validation";

export async function GET() {
  const rows = await db.execute<{
    id: number;
    name: string;
    industry: string | null;
    website: string | null;
    location: string | null;
    contact_count: number;
    deal_count: number;
  }>(sql`
    SELECT
      c.id,
      c.name,
      c.industry,
      c.website,
      c.location,
      (SELECT COUNT(*)::int FROM contacts WHERE contacts.company_id = c.id) AS contact_count,
      (SELECT COUNT(*)::int FROM deals WHERE deals.company_id = c.id) AS deal_count
    FROM companies c
    ORDER BY c.id DESC
  `);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      industry: r.industry,
      website: r.website,
      location: r.location,
      contactCount: Number(r.contact_count),
      dealCount: Number(r.deal_count),
    }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = companySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const [row] = await db
    .insert(companies)
    .values({
      name: data.name,
      industry: data.industry || null,
      website: data.website || null,
      location: data.location || null,
    })
    .returning();
  return NextResponse.json({ status: "saved", id: row.id });
}
