import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, ilike, or, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { contactSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? "50")));
  const search = searchParams.get("search")?.trim() ?? "";
  const offset = (page - 1) * limit;

  const whereClause = search
    ? or(
        ilike(contacts.firstName, `%${search}%`),
        ilike(contacts.lastName, `%${search}%`),
        ilike(contacts.email, `%${search}%`),
        ilike(contacts.phone, `%${search}%`),
        ilike(companies.name, `%${search}%`)
      )
    : undefined;

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(whereClause);

  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      jobTitle: contacts.jobTitle,
      website: contacts.website,
      location: contacts.location,
      status: contacts.status,
      notes: contacts.notes,
      companyId: contacts.companyId,
      companyName: companies.name,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(whereClause)
    .orderBy(desc(contacts.id))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    data: rows,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const [row] = await db
    .insert(contacts)
    .values({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      phone: data.phone || null,
      jobTitle: data.jobTitle || null,
      website: data.website || null,
      location: data.location || null,
      notes: data.notes || null,
      companyId: data.companyId ?? null,
    })
    .returning();

  return NextResponse.json({ status: "saved", id: row.id });
}
