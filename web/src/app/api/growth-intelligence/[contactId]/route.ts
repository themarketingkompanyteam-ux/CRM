import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  contacts,
  aiResearch,
  aiOpportunities,
  aiScores,
  aiSalesBriefs,
  aiOutreach,
  aiCallScripts,
} from "@/db/schema";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const { contactId } = await params;
  const id = Number(contactId);

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const [research, opportunities, score, salesBrief, outreach, callScript] = await Promise.all([
    db.select().from(aiResearch).where(eq(aiResearch.contactId, id)).limit(1).then((r) => r[0] ?? null),
    db.select().from(aiOpportunities).where(eq(aiOpportunities.contactId, id)),
    db.select().from(aiScores).where(eq(aiScores.contactId, id)).limit(1).then((r) => r[0] ?? null),
    db.select().from(aiSalesBriefs).where(eq(aiSalesBriefs.contactId, id)).limit(1).then((r) => r[0] ?? null),
    db.select().from(aiOutreach).where(eq(aiOutreach.contactId, id)),
    db.select().from(aiCallScripts).where(eq(aiCallScripts.contactId, id)).limit(1).then((r) => r[0] ?? null),
  ]);

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: `${contact.firstName} ${contact.lastName ?? ""}`.trim(),
      aiStatus: contact.aiStatus,
      aiOpportunityScore: contact.aiOpportunityScore,
      aiLastError: contact.aiLastError,
      aiAnalyzedAt: contact.aiAnalyzedAt,
    },
    research,
    opportunities,
    score,
    salesBrief,
    outreach,
    callScript,
  });
}
