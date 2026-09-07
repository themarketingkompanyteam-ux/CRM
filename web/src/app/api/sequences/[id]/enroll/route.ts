import { NextRequest, NextResponse } from "next/server";
import { enrollContactsInSequence } from "@/lib/mailbox/sequence-engine";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sequenceId = Number((await params).id);
  const body = await request.json();
  const contactIds: number[] = Array.isArray(body.contactIds) ? body.contactIds.map(Number) : [];
  if (contactIds.length === 0) return NextResponse.json({ error: "No contacts specified" }, { status: 400 });

  const enrolled = await enrollContactsInSequence(sequenceId, contactIds);
  return NextResponse.json({ enrolled, skipped: contactIds.length - enrolled });
}
