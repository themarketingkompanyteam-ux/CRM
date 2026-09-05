import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { calls, contacts, tasks, activities } from "@/db/schema";
import {
  CALL_OUTCOMES,
  OUTCOME_DEFAULT_TEMPERATURE,
  followUpForOutcome,
} from "@/lib/call-outcomes";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const contactId = Number(body.contactId);
  const outcome = String(body.outcome ?? "");
  const leadTemperature = body.leadTemperature ? String(body.leadTemperature) : null;
  const notes = body.notes ? String(body.notes) : null;
  const durationSeconds = Number(body.durationSeconds ?? 0);
  const callbackAt = body.callbackAt ? new Date(body.callbackAt) : null;

  if (!contactId || !CALL_OUTCOMES.includes(outcome as (typeof CALL_OUTCOMES)[number])) {
    return NextResponse.json({ error: "Invalid contactId or outcome" }, { status: 400 });
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const [call] = await db
    .insert(calls)
    .values({
      contactId,
      outcome,
      leadTemperature,
      notes,
      durationSeconds,
      callbackAt,
    })
    .returning();

  const newTemperature =
    leadTemperature ||
    OUTCOME_DEFAULT_TEMPERATURE[outcome as (typeof CALL_OUTCOMES)[number]] ||
    contact.leadStatus;

  await db
    .update(contacts)
    .set({
      leadStatus: newTemperature,
      callAttempts: sql`${contacts.callAttempts} + 1`,
      lastCalledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, contactId));

  const contactName = `${contact.firstName} ${contact.lastName ?? ""}`.trim();
  const followUp = followUpForOutcome(
    outcome as (typeof CALL_OUTCOMES)[number],
    contactName,
    callbackAt
  );

  let createdTask = null;
  if (followUp) {
    [createdTask] = await db
      .insert(tasks)
      .values({ contactId, title: followUp.title, dueAt: followUp.dueAt })
      .returning();
    await db
      .update(contacts)
      .set({ nextFollowUpAt: followUp.dueAt })
      .where(eq(contacts.id, contactId));
  }

  await db.insert(activities).values({
    contactId,
    type: "call",
    body: `Call outcome: ${outcome}${notes ? ` — ${notes}` : ""}`,
  });

  return NextResponse.json({
    status: "logged",
    callId: call.id,
    newLeadStatus: newTemperature,
    task: createdTask,
  });
}
