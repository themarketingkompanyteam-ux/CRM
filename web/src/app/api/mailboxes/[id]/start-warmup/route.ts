import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes } from "@/db/schema";
import { startWarmup } from "@/lib/mailbox/warmup";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
  if (!mailbox) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (mailbox.connectionStatus !== "connected") {
    return NextResponse.json({ error: "Connect the mailbox and pass Test Connection before starting warmup" }, { status: 400 });
  }
  await startWarmup(id);
  return NextResponse.json({ ok: true });
}
