import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { emailCampaigns } from "@/db/schema";

type CampaignRow = {
  id: number;
  name: string;
  status: string;
  instantly_campaign_id: string | null;
  created_at: string;
  launched_at: string | null;
  lead_count: number;
  sent_count: number;
  replied_count: number;
  bounced_count: number;
};

export async function GET() {
  // Raw query with explicitly table-qualified columns — see /api/domains/route.ts for why:
  // drizzle's query builder mis-scopes a drizzle column object interpolated inside a
  // correlated subquery's sql template and silently returns 0 instead of the real count.
  const rows = await db.execute<CampaignRow>(sql`
    SELECT
      c.id, c.name, c.status, c.instantly_campaign_id, c.created_at, c.launched_at,
      (SELECT COUNT(*) FROM email_campaign_leads WHERE email_campaign_leads.campaign_id = c.id)::int AS lead_count,
      (SELECT COUNT(*) FROM email_campaign_leads WHERE email_campaign_leads.campaign_id = c.id AND status IN ('sent','opened','clicked','replied'))::int AS sent_count,
      (SELECT COUNT(*) FROM email_campaign_leads WHERE email_campaign_leads.campaign_id = c.id AND status = 'replied')::int AS replied_count,
      (SELECT COUNT(*) FROM email_campaign_leads WHERE email_campaign_leads.campaign_id = c.id AND status = 'bounced')::int AS bounced_count
    FROM email_campaigns c
    ORDER BY c.created_at DESC
  `);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      instantlyCampaignId: r.instantly_campaign_id,
      createdAt: r.created_at,
      launchedAt: r.launched_at,
      leadCount: r.lead_count,
      sentCount: r.sent_count,
      repliedCount: r.replied_count,
      bouncedCount: r.bounced_count,
    }))
  );
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
