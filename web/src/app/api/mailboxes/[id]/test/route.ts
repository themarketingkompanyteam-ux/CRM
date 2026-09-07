import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes } from "@/db/schema";
import { providerFor } from "@/lib/mailbox/provider";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
  if (!mailbox) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const provider = providerFor(mailbox);
  const result = await provider.testConnection(mailbox);

  await db
    .update(mailboxes)
    .set({
      connectionStatus: result.ok ? "connected" : "error",
      lastConnectionError: result.ok ? null : result.message,
      updatedAt: new Date(),
    })
    .where(eq(mailboxes.id, id));

  return NextResponse.json(result);
}
