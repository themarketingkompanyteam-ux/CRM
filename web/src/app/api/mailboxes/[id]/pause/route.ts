import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes, mailboxAuditLog } from "@/db/schema";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = await request.json().catch(() => ({}));
  await db
    .update(mailboxes)
    .set({ healthStatus: "paused", campaignEnabled: 0, updatedAt: new Date() })
    .where(eq(mailboxes.id, id));
  await db.insert(mailboxAuditLog).values({ mailboxId: id, action: "manual_paused", reason: body.reason ?? "Paused by user" });
  return NextResponse.json({ ok: true });
}
