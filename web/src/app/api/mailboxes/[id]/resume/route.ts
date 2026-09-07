import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes, mailboxAuditLog } from "@/db/schema";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
  if (!mailbox) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(mailboxes)
    .set({ healthStatus: "healthy", healthReasons: [], campaignEnabled: 1, updatedAt: new Date() })
    .where(eq(mailboxes.id, id));
  await db.insert(mailboxAuditLog).values({ mailboxId: id, action: "manual_resumed" });
  return NextResponse.json({ ok: true });
}
