import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes } from "@/db/schema";
import { encryptSecret } from "@/lib/mailbox/crypto";
import { smtpProvider } from "@/lib/mailbox/smtp";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = await request.json();
  const { smtpHost, smtpPort, password, imapHost, imapPort } = body;
  if (!smtpHost || !smtpPort || !password) {
    return NextResponse.json({ error: "smtpHost, smtpPort, and password are required" }, { status: 400 });
  }

  const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
  if (!mailbox) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const smtpPasswordEnc = encryptSecret(password);

  // Verify before persisting, so a bad password never gets saved as "connected".
  const result = await smtpProvider.testConnection({ ...mailbox, smtpHost, smtpPort, smtpPasswordEnc });

  await db
    .update(mailboxes)
    .set({
      provider: "smtp",
      smtpHost,
      smtpPort,
      smtpPasswordEnc,
      imapHost: imapHost ?? null,
      imapPort: imapPort ?? null,
      connectionStatus: result.ok ? "connected" : "error",
      lastConnectionError: result.ok ? null : result.message,
      updatedAt: new Date(),
    })
    .where(eq(mailboxes.id, id));

  return NextResponse.json(result);
}
