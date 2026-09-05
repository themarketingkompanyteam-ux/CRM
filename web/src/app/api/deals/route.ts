import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deals, contacts, companies } from "@/db/schema";
import { dealSchema } from "@/lib/validation";

export const STAGES = ["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

export async function GET() {
  const rows = await db
    .select({
      id: deals.id,
      title: deals.title,
      contactId: deals.contactId,
      companyId: deals.companyId,
      value: deals.value,
      stage: deals.stage,
      probability: deals.probability,
      closeDate: deals.closeDate,
      owner: deals.owner,
      notes: deals.notes,
      contactName: sql<string>`concat(${contacts.firstName}, ' ', COALESCE(${contacts.lastName}, ''))`,
      companyName: companies.name,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(companies, eq(deals.companyId, companies.id))
    .orderBy(sql`${deals.id} DESC`);

  return NextResponse.json(
    rows.map((r) => ({ ...r, value: Number(r.value) }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = dealSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const stage = STAGES.includes(data.stage) ? data.stage : "New";

  const [row] = await db
    .insert(deals)
    .values({
      title: data.title,
      contactId: data.contactId ?? null,
      companyId: data.companyId ?? null,
      value: String(data.value),
      stage,
      probability: data.probability,
      closeDate: data.closeDate || null,
      owner: data.owner || null,
      notes: data.notes || null,
    })
    .returning();

  return NextResponse.json({ status: "saved", id: row.id });
}
