import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lists } from "@/db/schema";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(lists).where(eq(lists.id, Number(id)));
  return NextResponse.json({ status: "deleted" });
}
