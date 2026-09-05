import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import Papa from "papaparse";
import { db } from "@/db";
import { importJobs } from "@/db/schema";
import { detectColumnMapping } from "@/lib/csv-mapping";
import { importQueue } from "@/queue/import-queue";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filePath = path.join(UPLOAD_DIR, `${randomUUID()}.csv`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const text = buffer.toString("utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    preview: 0,
  });
  const headers = parsed.meta.fields ?? [];
  const mapping = detectColumnMapping(headers);
  const totalRows = parsed.data.length;

  const [job] = await db
    .insert(importJobs)
    .values({
      filename: file.name,
      status: "pending",
      totalRows,
      columnMapping: mapping,
    })
    .returning();

  await importQueue.add("import", { jobId: job.id, filePath });

  return NextResponse.json({ jobId: job.id, totalRows, mapping });
}
