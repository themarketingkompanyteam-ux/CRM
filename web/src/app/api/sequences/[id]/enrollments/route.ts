import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, asc } from "drizzle-orm";
import { db } from "@/db";
import { sequenceEnrollments, contacts, companies, sequences, mailboxes } from "@/db/schema";
import { effectiveDailyLimit } from "@/lib/mailbox/rotation";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sequenceId = Number((await params).id);

  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, sequenceId)).limit(1);

  const rows = await db
    .select({
      id: sequenceEnrollments.id,
      contactId: sequenceEnrollments.contactId,
      currentStep: sequenceEnrollments.currentStep,
      status: sequenceEnrollments.status,
      nextSendAt: sequenceEnrollments.nextSendAt,
      lastSentAt: sequenceEnrollments.lastSentAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      companyName: companies.name,
    })
    .from(sequenceEnrollments)
    .innerJoin(contacts, eq(sequenceEnrollments.contactId, contacts.id))
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(eq(sequenceEnrollments.sequenceId, sequenceId))
    .orderBy(asc(sequenceEnrollments.id));

  // Remaining real capacity today across every mailbox this campaign is allowed to use — this is
  // what actually gates whether a "due" send happens in the next queue tick or has to wait for
  // tomorrow's warmup/campaign limit to reset, so the UI can tell those two states apart honestly
  // instead of showing a countdown to zero for a send that can't actually go out yet.
  let capacityRemaining = 0;
  if (sequence?.mailboxIds && sequence.mailboxIds.length > 0) {
    const boxes = await db.select().from(mailboxes).where(inArray(mailboxes.id, sequence.mailboxIds));
    capacityRemaining = boxes
      .filter((m) => m.connectionStatus === "connected" && m.healthStatus !== "paused")
      .reduce((sum, m) => sum + Math.max(0, effectiveDailyLimit(m) - m.sentToday), 0);
  }

  const now = Date.now();
  let dueSlotsUsed = 0;
  const enriched = rows.map((r) => {
    if (r.status !== "active") {
      return { ...r, sendEta: null as string | null, blockedReason: null as string | null };
    }
    const dueAt = new Date(r.nextSendAt).getTime();
    if (dueAt > now) {
      // Genuinely scheduled in the future (a later step's delay) — real countdown.
      return { ...r, sendEta: r.nextSendAt, blockedReason: null };
    }
    // Due now — will it actually go out in the next queue tick, or is capacity exhausted today?
    dueSlotsUsed++;
    if (dueSlotsUsed <= capacityRemaining) {
      return { ...r, sendEta: "next_tick" as const, blockedReason: null };
    }
    return { ...r, sendEta: null, blockedReason: "no_capacity_today" };
  });

  return NextResponse.json(enriched);
}
