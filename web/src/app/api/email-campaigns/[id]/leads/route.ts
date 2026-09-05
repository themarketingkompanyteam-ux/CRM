import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailCampaigns, emailCampaignLeads, contacts, companies } from "@/db/schema";
import { validateLeadsForCampaign, addEligibleLeadsToCampaign } from "@/lib/email/campaign-service";
import { emailCampaignQueue } from "@/queue/email-campaign-queue";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = Number((await params).id);
  const rows = await db
    .select({
      id: emailCampaignLeads.id,
      contactId: emailCampaignLeads.contactId,
      status: emailCampaignLeads.status,
      instantlyLeadId: emailCampaignLeads.instantlyLeadId,
      addedAt: emailCampaignLeads.addedAt,
      lastEventAt: emailCampaignLeads.lastEventAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      companyName: companies.name,
    })
    .from(emailCampaignLeads)
    .innerJoin(contacts, eq(emailCampaignLeads.contactId, contacts.id))
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(eq(emailCampaignLeads.campaignId, campaignId));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = Number((await params).id);
  const body = await request.json();
  const contactIds: number[] = Array.isArray(body.contactIds) ? body.contactIds.map(Number) : [];
  const dryRun = body.dryRun === true;

  if (contactIds.length === 0) {
    return NextResponse.json({ error: "No contacts specified" }, { status: 400 });
  }

  const summary = await validateLeadsForCampaign(campaignId, contactIds);

  if (dryRun) {
    return NextResponse.json({ summary, added: 0 });
  }

  const added = await addEligibleLeadsToCampaign(campaignId, summary.eligibleContactIds);

  const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaignId)).limit(1);
  if (added > 0 && campaign?.instantlyCampaignId) {
    await emailCampaignQueue.add("push-leads", { type: "push-leads", campaignId });
  }

  return NextResponse.json({ summary, added });
}
