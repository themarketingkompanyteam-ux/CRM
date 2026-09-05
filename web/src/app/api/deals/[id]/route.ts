import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { STAGES } from "../route";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  if (!STAGES.includes(body.stage)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }
  await db
    .update(deals)
    .set({ stage: body.stage, updatedAt: new Date() })
    .where(eq(deals.id, Number(id)));
  return NextResponse.json({ status: "updated" });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(deals).where(eq(deals.id, Number(id)));
  return NextResponse.json({ status: "deleted" });
}
