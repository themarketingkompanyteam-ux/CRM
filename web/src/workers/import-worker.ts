import { createReadStream } from "fs";
import Papa from "papaparse";
import { Worker } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { redisConnection } from "@/queue/connection";
import type { ImportJobData } from "@/queue/import-queue";
import { db } from "@/db";
import { contacts, companies, importJobs } from "@/db/schema";
import { detectColumnMapping, extractRow } from "@/lib/csv-mapping";

const BATCH_SIZE = 200;
const PROGRESS_UPDATE_EVERY = 200;

async function processImportJob(data: ImportJobData) {
  const { jobId, filePath } = data;

  await db
    .update(importJobs)
    .set({ status: "processing" })
    .where(eq(importJobs.id, jobId));

  const companyCache = new Map<string, number>();
  const existingCompanies = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies);
  for (const c of existingCompanies) {
    companyCache.set(c.name.toLowerCase(), c.id);
  }

  let createdCount = 0;
  let updatedCount = 0;
  let companiesCreatedCount = 0;
  let skippedCount = 0;
  let processedRows = 0;
  const errors: string[] = [];

  let mapping: Record<string, string> | null = null;
  let batch: ReturnType<typeof extractRow>[] = [];

  async function flushBatch() {
    if (batch.length === 0) return;
    for (const row of batch) {
      if (!row.phone && !row.email) {
        skippedCount++;
        continue;
      }

      let companyId: number | null = null;
      if (row.company) {
        const key = row.company.toLowerCase();
        const cached = companyCache.get(key);
        if (cached) {
          companyId = cached;
        } else {
          const [newCompany] = await db
            .insert(companies)
            .values({ name: row.company, location: row.location || null })
            .onConflictDoNothing()
            .returning();
          if (newCompany) {
            companyId = newCompany.id;
            companyCache.set(key, newCompany.id);
            companiesCreatedCount++;
          } else {
            const [existing] = await db
              .select({ id: companies.id })
              .from(companies)
              .where(sql`lower(${companies.name}) = ${key}`)
              .limit(1);
            if (existing) {
              companyId = existing.id;
              companyCache.set(key, existing.id);
            }
          }
        }
      }

      const existingMatch = row.email
        ? await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(sql`lower(${contacts.email}) = ${row.email.toLowerCase()}`)
            .limit(1)
        : row.phone
          ? await db
              .select({ id: contacts.id })
              .from(contacts)
              .where(eq(contacts.phone, row.phone))
              .limit(1)
          : [];

      if (existingMatch[0]) {
        await db
          .update(contacts)
          .set({
            firstName: row.firstName,
            lastName: row.lastName || undefined,
            email: row.email || undefined,
            phone: row.phone || undefined,
            jobTitle: row.jobTitle || undefined,
            website: row.website || undefined,
            location: row.location || undefined,
            companyId: companyId ?? undefined,
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, existingMatch[0].id));
        updatedCount++;
      } else {
        await db.insert(contacts).values({
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email || null,
          phone: row.phone || null,
          jobTitle: row.jobTitle || null,
          website: row.website || null,
          location: row.location || null,
          companyId,
        });
        createdCount++;
      }
    }
    batch = [];
  }

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath, "utf-8");
    Papa.parse<Record<string, string>>(stream, {
      header: true,
      skipEmptyLines: true,
      chunkSize: 1024 * 64,
      step: (result, parser) => {
        if (!mapping) {
          mapping = detectColumnMapping(result.meta.fields ?? []);
        }
        parser.pause();
        (async () => {
          try {
            const extracted = extractRow(result.data, mapping!);
            batch.push(extracted);
            processedRows++;

            if (batch.length >= BATCH_SIZE) {
              await flushBatch();
            }
            if (processedRows % PROGRESS_UPDATE_EVERY === 0) {
              await db
                .update(importJobs)
                .set({
                  processedRows,
                  createdCount,
                  updatedCount,
                  companiesCreatedCount,
                  skippedCount,
                })
                .where(eq(importJobs.id, jobId));
            }
            parser.resume();
          } catch (err) {
            errors.push(String(err));
            parser.resume();
          }
        })();
      },
      complete: () => resolve(),
      error: (err) => reject(err),
    });
  });

  await flushBatch();

  await db
    .update(importJobs)
    .set({
      status: "completed",
      processedRows,
      createdCount,
      updatedCount,
      companiesCreatedCount,
      skippedCount,
      errors,
      finishedAt: new Date(),
    })
    .where(eq(importJobs.id, jobId));
}

const worker = new Worker<ImportJobData>(
  "csv-import",
  async (job) => {
    await processImportJob(job.data);
  },
  { connection: redisConnection, concurrency: 2 }
);

worker.on("failed", async (job, err) => {
  console.error("Import job failed", job?.id, err);
  if (job) {
    await db
      .update(importJobs)
      .set({ status: "failed", errors: [String(err)] })
      .where(eq(importJobs.id, job.data.jobId));
  }
});

console.log("Import worker started, waiting for jobs...");
