import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { domains, mailboxes } from "@/db/schema";
import { runDomainCheck } from "@/lib/domains/service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [domain] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
  if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const linkedMailboxes = await db
    .select({ id: mailboxes.id, email: mailboxes.email, connectionStatus: mailboxes.connectionStatus, warmupStatus: mailboxes.warmupStatus, healthStatus: mailboxes.healthStatus })
    .from(mailboxes)
    .where(eq(mailboxes.domainId, id));
  return NextResponse.json({ domain, mailboxes: linkedMailboxes });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = await request.json();
  const updatable: Record<string, unknown> = {};
  for (const key of ["dkimSelector", "notes", "status"] as const) {
    if (body[key] !== undefined) updatable[key] = body[key];
  }
  await db.update(domains).set(updatable).where(eq(domains.id, id));
  // Re-run the check immediately if the DKIM selector changed, so the UI reflects it without a separate click.
  const updated = body.dkimSelector !== undefined ? await runDomainCheck(id) : (await db.select().from(domains).where(eq(domains.id, id)).limit(1))[0];
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  await db.delete(domains).where(eq(domains.id, id));
  return NextResponse.json({ ok: true });
}
