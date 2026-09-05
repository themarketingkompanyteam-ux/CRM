import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, or, count } from "drizzle-orm";
import { db } from "@/db";
import { contacts, companies, listMemberships } from "@/db/schema";
import { contactSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? "50")));
  const search = searchParams.get("search")?.trim() ?? "";
  const listId = searchParams.get("listId") ? Number(searchParams.get("listId")) : null;
  const leadStatus = searchParams.get("leadStatus")?.trim() || null;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(contacts.firstName, `%${search}%`),
        ilike(contacts.lastName, `%${search}%`),
        ilike(contacts.email, `%${search}%`),
        ilike(contacts.phone, `%${search}%`),
        ilike(companies.name, `%${search}%`)
      )
    );
  }
  if (leadStatus) conditions.push(eq(contacts.leadStatus, leadStatus));
  if (listId) conditions.push(eq(listMemberships.listId, listId));
  const whereClause = conditions.length ? and(...conditions) : undefined;

  let total: number;
  let rows;

  if (listId) {
    const [{ value }] = await db
      .select({ value: count() })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .innerJoin(listMemberships, eq(listMemberships.contactId, contacts.id))
      .where(whereClause);
    total = value;

    rows = await db
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
        leadStatus: contacts.leadStatus,
        notes: contacts.notes,
        companyId: contacts.companyId,
        companyName: companies.name,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .innerJoin(listMemberships, eq(listMemberships.contactId, contacts.id))
      .where(whereClause)
      .orderBy(desc(contacts.id))
      .limit(limit)
      .offset(offset);
  } else {
    const [{ value }] = await db
      .select({ value: count() })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .where(whereClause);
    total = value;

    rows = await db
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
        leadStatus: contacts.leadStatus,
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
  }

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
