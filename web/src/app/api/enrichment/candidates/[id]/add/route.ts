import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { enrichmentCandidates, contacts, companies, contactEmails, contactPhones } from "@/db/schema";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const force = body.force === true;

  const [candidate] = await db
    .select()
    .from(enrichmentCandidates)
    .where(eq(enrichmentCandidates.id, Number(id)))
    .limit(1);
  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  const emails = (candidate.emails ?? []).map((e) => e.email);
  const phones = (candidate.phones ?? []).map((p) => p.phone);

  // Duplicate protection: verified email/phone/LinkedIn/name+domain match — never merge on name alone.
  if (!force) {
    const conditions = [];
    if (emails.length > 0) conditions.push(sql`email IN ${emails}`);
    if (phones.length > 0) conditions.push(sql`phone IN ${phones}`);
    if (candidate.linkedinUrl) conditions.push(sql`linkedin_url = ${candidate.linkedinUrl}`);
    if (candidate.companyDomain && candidate.firstName) {
      conditions.push(sql`(lower(first_name) = ${candidate.firstName.toLowerCase()}
        AND lower(coalesce(last_name,'')) = ${candidate.lastName?.toLowerCase() ?? ""}
        AND company_domain = ${candidate.companyDomain})`);
    }

    const dupes = conditions.length === 0
      ? []
      : await db.execute<{ id: number; first_name: string; last_name: string | null; email: string | null }>(sql`
          SELECT id, first_name, last_name, email FROM contacts
          WHERE ${sql.join(conditions, sql` OR `)}
          LIMIT 5
        `);
    if (dupes.length > 0) {
      return NextResponse.json(
        {
          status: "possible_duplicate",
          matches: dupes.map((d) => ({ id: d.id, name: `${d.first_name} ${d.last_name ?? ""}`.trim(), email: d.email })),
        },
        { status: 409 }
      );
    }
  }

  let companyId: number | null = null;
  if (candidate.companyName) {
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(sql`lower(${companies.name}) = ${candidate.companyName.toLowerCase()}`)
      .limit(1);
    if (existing) companyId = existing.id;
    else {
      const [created] = await db.insert(companies).values({ name: candidate.companyName }).returning();
      companyId = created.id;
    }
  }

  const primaryEmail = emails[0] ?? null;
  const primaryPhone = phones[0] ?? null;

  const [contact] = await db
    .insert(contacts)
    .values({
      firstName: candidate.firstName || "Unknown",
      lastName: candidate.lastName,
      email: primaryEmail,
      phone: primaryPhone,
      jobTitle: candidate.jobTitle,
      companyId,
      companyDomain: candidate.companyDomain,
      linkedinUrl: candidate.linkedinUrl,
      enrichmentStatus: "ENRICHED",
      enrichmentConfidence: candidate.confidence,
      enrichmentProvider: (candidate.providerSources ?? [])[0] ?? null,
      enrichedAt: new Date(),
    })
    .returning();

  for (const e of candidate.emails ?? []) {
    await db
      .insert(contactEmails)
      .values({ contactId: contact.id, email: e.email, provider: e.provider, confidence: e.confidence, verificationStatus: e.verificationStatus })
      .onConflictDoNothing();
  }
  for (const p of candidate.phones ?? []) {
    await db
      .insert(contactPhones)
      .values({ contactId: contact.id, phone: p.phone, provider: p.provider, confidence: p.confidence })
      .onConflictDoNothing();
  }

  await db
    .update(enrichmentCandidates)
    .set({ status: "ADDED" })
    .where(eq(enrichmentCandidates.id, candidate.id));

  return NextResponse.json({ status: "added", contactId: contact.id });
}
