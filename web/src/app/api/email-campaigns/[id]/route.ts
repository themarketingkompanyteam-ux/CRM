import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailCampaigns, emailCampaignSteps, emailSendingAccounts } from "@/db/schema";
import { instantlyProvider } from "@/lib/email/instantly";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, id)).limit(1);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const steps = await db
    .select()
    .from(emailCampaignSteps)
    .where(eq(emailCampaignSteps.campaignId, id))
    .orderBy(emailCampaignSteps.stepOrder);

  const [leadStats] = await db.execute<{
    total: number;
    added: number;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    unsubscribed: number;
  }>(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status IN ('added','sent','opened','clicked','replied'))::int AS added,
      COUNT(*) FILTER (WHERE status IN ('sent','opened','clicked','replied'))::int AS sent,
      COUNT(*) FILTER (WHERE status IN ('opened','clicked','replied'))::int AS opened,
      COUNT(*) FILTER (WHERE status IN ('clicked','replied'))::int AS clicked,
      COUNT(*) FILTER (WHERE status = 'replied')::int AS replied,
      COUNT(*) FILTER (WHERE status = 'bounced')::int AS bounced,
      COUNT(*) FILTER (WHERE status = 'unsubscribed')::int AS unsubscribed
    FROM email_campaign_leads WHERE campaign_id = ${id}
  `);

  let sendingAccounts: (typeof emailSendingAccounts.$inferSelect)[] = [];
  if (campaign.sendingAccountEmails && campaign.sendingAccountEmails.length > 0) {
    sendingAccounts = await db
      .select()
      .from(emailSendingAccounts)
      .where(sql`${emailSendingAccounts.email} = ANY(${campaign.sendingAccountEmails})`);
  }

  let remoteAnalytics = null;
  if (campaign.instantlyCampaignId) {
    remoteAnalytics = await instantlyProvider.getCampaignAnalytics(campaign.instantlyCampaignId).catch(() => null);
  }

  return NextResponse.json({ campaign, steps, leadStats, sendingAccounts, remoteAnalytics });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = await request.json();

  const updatable: Record<string, unknown> = {};
  for (const key of [
    "name",
    "description",
    "audienceFilter",
    "personalizationMode",
    "dailyLimit",
    "stopOnReply",
    "openTracking",
    "linkTracking",
    "scheduleDays",
    "scheduleFrom",
    "scheduleTo",
    "timezone",
    "sendingAccountEmails",
  ] as const) {
    if (body[key] !== undefined) updatable[key] = body[key];
  }
  updatable.updatedAt = new Date();

  if (body.steps && Array.isArray(body.steps)) {
    await db.delete(emailCampaignSteps).where(eq(emailCampaignSteps.campaignId, id));
    if (body.steps.length > 0) {
      await db.insert(emailCampaignSteps).values(
        body.steps.map((s: { subject: string; body: string; delayDays?: number }, i: number) => ({
          campaignId: id,
          stepOrder: i,
          subject: s.subject,
          body: s.body,
          delayDays: s.delayDays ?? 2,
        }))
      );
    }
  }

  const [updated] = await db.update(emailCampaigns).set(updatable).where(eq(emailCampaigns.id, id)).returning();
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, id)).limit(1);
  if (campaign?.instantlyCampaignId) {
    await instantlyProvider.deleteCampaign(campaign.instantlyCampaignId).catch((e) => console.error("Failed to delete Instantly campaign", e));
  }
  await db.delete(emailCampaigns).where(eq(emailCampaigns.id, id));
  return NextResponse.json({ ok: true });
}
