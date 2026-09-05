import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { maybeTriggerGrowthIntelligence } from "@/lib/ai/automation";

const LEAD_STATUSES = ["Cold", "Warm", "Hot", "Customer"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [row] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, Number(id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (body.leadStatus !== undefined) {
    if (!LEAD_STATUSES.includes(body.leadStatus)) {
      return NextResponse.json({ error: "Invalid lead status" }, { status: 400 });
    }
    update.leadStatus = body.leadStatus;
  }
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.nextFollowUpAt !== undefined) {
    update.nextFollowUpAt = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
  }

  await db.update(contacts).set(update).where(eq(contacts.id, Number(id)));

  if (typeof update.leadStatus === "string") {
    maybeTriggerGrowthIntelligence(Number(id), update.leadStatus).catch((err) =>
      console.error("Growth Intelligence trigger failed", err)
    );
  }

  return NextResponse.json({ status: "updated" });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(contacts).where(eq(contacts.id, Number(id)));
  return NextResponse.json({ status: "deleted" });
}
