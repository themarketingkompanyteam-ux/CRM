import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailCampaigns } from "@/db/schema";
import { instantlyProvider } from "@/lib/email/instantly";
import { assertCampaignLaunchable, pushPendingLeadsToInstantly } from "@/lib/email/campaign-service";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = Number((await params).id);

  let checked;
  try {
    checked = await assertCampaignLaunchable(campaignId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Campaign cannot launch";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { campaign, steps } = checked;

  try {
    let instantlyCampaignId = campaign.instantlyCampaignId;
    if (!instantlyCampaignId) {
      const remote = await instantlyProvider.createCampaign({
        name: campaign.name,
        steps: steps.map((s) => ({ subject: s.subject, body: s.body, delayDays: s.delayDays })),
        sendingAccountEmails: campaign.sendingAccountEmails ?? [],
        dailyLimit: campaign.dailyLimit ?? 50,
        stopOnReply: !!campaign.stopOnReply,
        openTracking: !!campaign.openTracking,
        linkTracking: !!campaign.linkTracking,
        schedule: {
          days: campaign.scheduleDays ?? [1, 2, 3, 4, 5],
          from: campaign.scheduleFrom ?? "09:00",
          to: campaign.scheduleTo ?? "17:00",
          timezone: campaign.timezone ?? "Etc/UTC",
        },
      });
      instantlyCampaignId = remote.id;
      await db
        .update(emailCampaigns)
        .set({ instantlyCampaignId, updatedAt: new Date() })
        .where(eq(emailCampaigns.id, campaignId));
    }

    await pushPendingLeadsToInstantly(campaignId);
    await instantlyProvider.resumeCampaign(instantlyCampaignId);

    const [updated] = await db
      .update(emailCampaigns)
      .set({ status: "active", launchedAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(emailCampaigns.id, campaignId))
      .returning();

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Launch failed";
    await db
      .update(emailCampaigns)
      .set({ status: "error", lastError: message, updatedAt: new Date() })
      .where(eq(emailCampaigns.id, campaignId));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
