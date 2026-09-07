import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sequences, sequenceSteps } from "@/db/schema";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [sequence] = await db.select().from(sequences).where(eq(sequences.id, id)).limit(1);
  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const steps = await db.select().from(sequenceSteps).where(eq(sequenceSteps.sequenceId, id)).orderBy(sequenceSteps.stepOrder);
  return NextResponse.json({ sequence, steps });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = await request.json();

  const updatable: Record<string, unknown> = {};
  for (const key of ["name", "description", "status"] as const) {
    if (body[key] !== undefined) updatable[key] = body[key];
  }
  updatable.updatedAt = new Date();

  if (body.steps && Array.isArray(body.steps)) {
    await db.delete(sequenceSteps).where(eq(sequenceSteps.sequenceId, id));
    if (body.steps.length > 0) {
      await db.insert(sequenceSteps).values(
        body.steps.map((s: { subject: string; body: string; delayDays?: number }, i: number) => ({
          sequenceId: id,
          stepOrder: i,
          subject: s.subject,
          body: s.body,
          delayDays: s.delayDays ?? 3,
        }))
      );
    }
  }

  const [updated] = await db.update(sequences).set(updatable).where(eq(sequences.id, id)).returning();
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  await db.delete(sequences).where(eq(sequences.id, id));
  return NextResponse.json({ ok: true });
}
