import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { redisConnection } from "@/queue/connection";
import type { EnrichmentJobData } from "@/queue/enrichment-queue";
import { db } from "@/db";
import { contacts, enrichmentQueue as enrichmentQueueTable } from "@/db/schema";
import { routeEnrichment } from "@/lib/enrichment/router";
import { EnrichmentSearchInput } from "@/lib/enrichment/types";

async function processEnrichmentJob(data: EnrichmentJobData) {
  const { contactId, operation } = data;

  await db
    .update(enrichmentQueueTable)
    .set({ status: "PROCESSING", updatedAt: new Date() })
    .where(eq(enrichmentQueueTable.contactId, contactId));

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) return;

  const input: EnrichmentSearchInput = {
    firstName: contact.firstName,
    lastName: contact.lastName ?? undefined,
    companyDomain: contact.companyDomain ?? undefined,
    jobTitle: contact.jobTitle ?? undefined,
    linkedinUrl: contact.linkedinUrl ?? undefined,
    location: contact.location ?? undefined,
    email: contact.email ?? undefined,
  };

  const result = await routeEnrichment(contactId, input, operation);

  const finalStatus = result.success ? "ENRICHED" : result.outcome === "NO_MATCH" ? "NO_MATCH" : "FAILED";

  await db
    .update(enrichmentQueueTable)
    .set({
      status: finalStatus,
      lastProvider: result.providerUsed ?? null,
      lastError: result.success ? null : result.triedProviders.find((t) => t.errorMessage)?.errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(enrichmentQueueTable.contactId, contactId));
}

const worker = new Worker<EnrichmentJobData>(
  "enrichment",
  async (job) => {
    await processEnrichmentJob(job.data);
  },
  { connection: redisConnection, concurrency: 2, limiter: { max: 10, duration: 60_000 } }
);

worker.on("failed", async (job, err) => {
  console.error("Enrichment job failed", job?.id, err);
  if (job) {
    await db
      .update(enrichmentQueueTable)
      .set({ status: "FAILED", lastError: String(err), updatedAt: new Date() })
      .where(eq(enrichmentQueueTable.contactId, job.data.contactId));
  }
});

console.log("Enrichment worker started, waiting for jobs...");
