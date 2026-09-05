import { NextRequest, NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailCampaigns } from "@/db/schema";

export async function GET() {
  const rows = await db
    .select({
      id: emailCampaigns.id,
      name: emailCampaigns.name,
      status: emailCampaigns.status,
      instantlyCampaignId: emailCampaigns.instantlyCampaignId,
      createdAt: emailCampaigns.createdAt,
      launchedAt: emailCampaigns.launchedAt,
      leadCount: sql<number>`(SELECT COUNT(*) FROM email_campaign_leads WHERE campaign_id = ${emailCampaigns.id})::int`,
      sentCount: sql<number>`(SELECT COUNT(*) FROM email_campaign_leads WHERE campaign_id = ${emailCampaigns.id} AND status IN ('sent','opened','clicked','replied'))::int`,
      repliedCount: sql<number>`(SELECT COUNT(*) FROM email_campaign_leads WHERE campaign_id = ${emailCampaigns.id} AND status = 'replied')::int`,
      bouncedCount: sql<number>`(SELECT COUNT(*) FROM email_campaign_leads WHERE campaign_id = ${emailCampaigns.id} AND status = 'bounced')::int`,
    })
    .from(emailCampaigns)
    .orderBy(desc(emailCampaigns.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });

  const [campaign] = await db
    .insert(emailCampaigns)
    .values({
      name: body.name,
      description: body.description ?? null,
      audienceFilter: body.audienceFilter ?? {},
      personalizationMode: body.personalizationMode ?? "standard",
      dailyLimit: body.dailyLimit ?? 50,
      createdBy: body.createdBy ?? "user",
    })
    .returning();

  return NextResponse.json(campaign);
}
