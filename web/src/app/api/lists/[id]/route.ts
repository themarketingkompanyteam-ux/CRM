import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lists, listMemberships, contacts } from "@/db/schema";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const members = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
    })
    .from(listMemberships)
    .innerJoin(contacts, eq(listMemberships.contactId, contacts.id))
    .where(eq(listMemberships.listId, id));
  return NextResponse.json(members);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(lists).where(eq(lists.id, Number(id)));
  return NextResponse.json({ status: "deleted" });
}
