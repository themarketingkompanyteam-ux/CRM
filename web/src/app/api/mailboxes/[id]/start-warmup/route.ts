import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes, domains } from "@/db/schema";
import { startWarmup } from "@/lib/mailbox/warmup";
import { domainPassesComplianceGate } from "@/lib/domains/service";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
  if (!mailbox) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (mailbox.connectionStatus !== "connected") {
    return NextResponse.json({ error: "Connect the mailbox and pass Test Connection before starting warmup" }, { status: 400 });
  }

  const [domain] = mailbox.domainId ? await db.select().from(domains).where(eq(domains.id, mailbox.domainId)).limit(1) : [];
  if (!domainPassesComplianceGate(domain ?? null)) {
    return NextResponse.json(
      {
        error: `Domain ${mailbox.domain} fails required authentication checks (MX/SPF/DKIM/DMARC) — fix DNS records on the Domains page before starting warmup.`,
        domainCheckReasons: domain?.checkReasons ?? ["Domain has not been checked yet"],
      },
      { status: 400 }
    );
  }

  await startWarmup(id);
  return NextResponse.json({ ok: true });
}
