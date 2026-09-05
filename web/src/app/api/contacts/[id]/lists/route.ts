import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { listMemberships, lists } from "@/db/schema";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db
    .select({ id: lists.id, name: lists.name })
    .from(listMemberships)
    .innerJoin(lists, eq(listMemberships.listId, lists.id))
    .where(eq(listMemberships.contactId, Number(id)));
  return NextResponse.json(rows);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const listId = Number(body.listId);
  await db
    .insert(listMemberships)
    .values({ contactId: Number(id), listId })
    .onConflictDoNothing();
  return NextResponse.json({ status: "added" });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const listId = Number(searchParams.get("listId"));
  await db
    .delete(listMemberships)
    .where(
      and(
        eq(listMemberships.contactId, Number(id)),
        eq(listMemberships.listId, listId)
      )
    );
  return NextResponse.json({ status: "removed" });
}
