import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes, mailboxSendLog, mailboxAuditLog } from "@/db/schema";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [mailbox] = await db
    .select({
      id: mailboxes.id,
      email: mailboxes.email,
      domain: mailboxes.domain,
      domainId: mailboxes.domainId,
      provider: mailboxes.provider,
      connectionStatus: mailboxes.connectionStatus,
      lastConnectionError: mailboxes.lastConnectionError,
      warmupStatus: mailboxes.warmupStatus,
      warmupStartedAt: mailboxes.warmupStartedAt,
      warmupDay: mailboxes.warmupDay,
      warmupDailyLimit: mailboxes.warmupDailyLimit,
      campaignDailyLimit: mailboxes.campaignDailyLimit,
      sentToday: mailboxes.sentToday,
      bouncedToday: mailboxes.bouncedToday,
      repliedToday: mailboxes.repliedToday,
      unsubscribesToday: mailboxes.unsubscribesToday,
      healthScore: mailboxes.healthScore,
      healthStatus: mailboxes.healthStatus,
      healthReasons: mailboxes.healthReasons,
      campaignEnabled: mailboxes.campaignEnabled,
      createdAt: mailboxes.createdAt,
    })
    .from(mailboxes)
    .where(eq(mailboxes.id, id))
    .limit(1);
  if (!mailbox) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recentSends = await db
    .select()
    .from(mailboxSendLog)
    .where(eq(mailboxSendLog.mailboxId, id))
    .orderBy(desc(mailboxSendLog.sentAt))
    .limit(50);

  const auditLog = await db
    .select()
    .from(mailboxAuditLog)
    .where(eq(mailboxAuditLog.mailboxId, id))
    .orderBy(desc(mailboxAuditLog.createdAt))
    .limit(50);

  return NextResponse.json({ mailbox, recentSends, auditLog });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = await request.json();
  const updatable: Record<string, unknown> = {};
  for (const key of ["campaignDailyLimit", "campaignEnabled", "firstName", "lastName"] as const) {
    if (body[key] !== undefined) updatable[key] = body[key];
  }
  updatable.updatedAt = new Date();
  const [updated] = await db.update(mailboxes).set(updatable).where(eq(mailboxes.id, id)).returning({ id: mailboxes.id });
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  await db.delete(mailboxes).where(eq(mailboxes.id, id));
  return NextResponse.json({ ok: true });
}
