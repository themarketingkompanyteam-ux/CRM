import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { domains } from "@/db/schema";
import { hostingerClient } from "@/lib/hostinger/client";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [domain] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
  if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const records = await hostingerClient.getDnsRecords(domain.domain);
    return NextResponse.json(records);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to fetch Hostinger DNS records" }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [domain] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
  if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const records: { name: string; type: string; ttl: number; content: string }[] = body.records;
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: "records array is required" }, { status: 400 });
  }

  try {
    await hostingerClient.upsertDnsRecords(domain.domain, records);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to update Hostinger DNS records" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
