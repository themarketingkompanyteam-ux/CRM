import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sequenceEnrollments, contacts, companies } from "@/db/schema";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sequenceId = Number((await params).id);
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
    .where(eq(sequenceEnrollments.sequenceId, sequenceId));
  return NextResponse.json(rows);
}
