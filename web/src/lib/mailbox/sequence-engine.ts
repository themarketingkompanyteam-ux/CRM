import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { sequences, sequenceSteps, sequenceEnrollments } from "@/db/schema";
import { sendToContact } from "./send-engine";

export async function enrollContactsInSequence(sequenceId: number, contactIds: number[]) {
  if (contactIds.length === 0) return 0;
  const rows = contactIds.map((contactId) => ({ sequenceId, contactId, currentStep: 0, nextSendAt: new Date() }));
  const inserted = await db.insert(sequenceEnrollments).values(rows).onConflictDoNothing().returning({ id: sequenceEnrollments.id });
  return inserted.length;
}

/** Runs on a schedule. Processes every active enrollment whose next step is due, sends it, and advances state. */
export async function processDueSequenceSends() {
  const due = await db
    .select()
    .from(sequenceEnrollments)
    .where(and(eq(sequenceEnrollments.status, "active"), lte(sequenceEnrollments.nextSendAt, new Date())))
    .limit(200);

  let sent = 0;
  let deferred = 0;
  let completed = 0;

  for (const enrollment of due) {
    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, enrollment.sequenceId))
      .orderBy(sequenceSteps.stepOrder);

    const step = steps[enrollment.currentStep];
    if (!step) {
      await db
        .update(sequenceEnrollments)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(sequenceEnrollments.id, enrollment.id));
      completed++;
      continue;
    }

    const [sequence] = await db.select().from(sequences).where(eq(sequences.id, enrollment.sequenceId)).limit(1);
    if (!sequence || sequence.status !== "active") continue;

    const result = await sendToContact(
      enrollment.contactId,
      { subject: step.subject, body: step.body },
      { sequenceEnrollmentId: enrollment.id }
    );

    if (!result.ok && result.reason === "No eligible mailbox with remaining capacity") {
      // Try again on the next tick rather than pushing the whole sequence back a full step delay.
      deferred++;
      continue;
    }

    const nextStep = steps[enrollment.currentStep + 1];
    const nextSendAt = nextStep ? new Date(Date.now() + nextStep.delayDays * 24 * 60 * 60 * 1000) : null;

    await db
      .update(sequenceEnrollments)
      .set({
        currentStep: enrollment.currentStep + 1,
        status: nextStep ? "active" : "completed",
        nextSendAt: nextSendAt ?? enrollment.nextSendAt,
        lastSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sequenceEnrollments.id, enrollment.id));

    if (nextStep) sent++;
    else completed++;
  }

  return { processed: due.length, sent, deferred, completed };
}

/** Stops future sends for a contact's active enrollments — called on reply/bounce/unsubscribe. */
export async function stopActiveEnrollmentsForContact(contactId: number, status: "stopped_reply" | "stopped_bounce" | "stopped_unsubscribe") {
  await db
    .update(sequenceEnrollments)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(sequenceEnrollments.contactId, contactId), eq(sequenceEnrollments.status, "active")));
}
