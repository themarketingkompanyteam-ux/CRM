import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, companies, enrichmentQueue } from "@/db/schema";
import { routeEnrichment, EnrichOperation } from "@/lib/enrichment/router";
import { EnrichmentSearchInput } from "@/lib/enrichment/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const contactId = Number(body.contactId);
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });

  // Default: always try both email and phone — enrichment isn't blocked just
  // because the contact already has one of them (e.g. finding a founder's
  // direct line even though a general company number is already on file).
  const operations: EnrichOperation[] = Array.isArray(body.operations) && body.operations.length > 0
    ? body.operations
    : ["search_email", "find_phone"];

  const [row] = await db
    .select({ contact: contacts, companyName: companies.name })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const contact = row.contact;

  const input: EnrichmentSearchInput = {
    firstName: contact.firstName,
    lastName: contact.lastName ?? undefined,
    companyName: row.companyName ?? undefined,
    companyDomain: contact.companyDomain ?? undefined,
    jobTitle: contact.jobTitle ?? undefined,
    linkedinUrl: contact.linkedinUrl ?? undefined,
    location: contact.location ?? undefined,
    email: contact.email ?? undefined,
    phone: contact.phone ?? undefined,
  };

  const results = [];
  let anySuccess = false;
  let lastProvider: string | null = null;

  for (const operation of operations) {
    const result = await routeEnrichment(contactId, input, operation);
    results.push({ operation, ...result });
    if (result.success) {
      anySuccess = true;
      lastProvider = result.providerUsed ?? lastProvider;
    }
  }

  const status = anySuccess
    ? "ENRICHED"
    : results.some((r) => r.outcome === "NO_MATCH")
      ? "NO_MATCH"
      : "FAILED";

  await db
    .insert(enrichmentQueue)
    .values({ contactId, status, source: "manual", lastProvider })
    .onConflictDoUpdate({
      target: enrichmentQueue.contactId,
      set: { status, lastProvider, updatedAt: new Date() },
    });

  return NextResponse.json({ success: anySuccess, results });
}
