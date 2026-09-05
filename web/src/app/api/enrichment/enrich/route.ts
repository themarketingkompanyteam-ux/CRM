import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, enrichmentQueue } from "@/db/schema";
import { routeEnrichment } from "@/lib/enrichment/router";
import { EnrichmentSearchInput } from "@/lib/enrichment/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const contactId = Number(body.contactId);
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const input: EnrichmentSearchInput = {
    firstName: contact.firstName,
    lastName: contact.lastName ?? undefined,
    companyDomain: contact.companyDomain ?? undefined,
    jobTitle: contact.jobTitle ?? undefined,
    linkedinUrl: contact.linkedinUrl ?? undefined,
    location: contact.location ?? undefined,
    email: contact.email ?? undefined,
  };

  const result = await routeEnrichment(contactId, input, "search_email");

  await db
    .insert(enrichmentQueue)
    .values({
      contactId,
      status: result.success ? "ENRICHED" : result.outcome === "NO_MATCH" ? "NO_MATCH" : "FAILED",
      source: "manual",
      lastProvider: result.providerUsed ?? null,
    })
    .onConflictDoUpdate({
      target: enrichmentQueue.contactId,
      set: {
        status: result.success ? "ENRICHED" : result.outcome === "NO_MATCH" ? "NO_MATCH" : "FAILED",
        lastProvider: result.providerUsed ?? null,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json(result);
}
