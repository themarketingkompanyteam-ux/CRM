import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailCampaigns } from "@/db/schema";
import { instantlyProvider } from "@/lib/email/instantly";
import { syncSendingAccounts } from "@/lib/email/campaign-service";
import { saveInstantlyState } from "@/lib/email/settings";

// Instantly campaign status codes (from API v2 docs): 1=Active, 2=Paused, 3=Completed, others=draft/error states.
function mapRemoteStatus(status: number): string {
  if (status === 1) return "active";
  if (status === 2) return "paused";
  if (status === 3 || status === 4) return "completed";
  return "draft";
}

export async function POST() {
  if (!process.env.INSTANTLY_API_KEY) {
    return NextResponse.json({ error: "INSTANTLY_API_KEY is not set" }, { status: 400 });
  }

  const accountCount = await syncSendingAccounts();

  const remoteCampaigns = await instantlyProvider.listCampaigns();
  let imported = 0;
  for (const rc of remoteCampaigns) {
    const [existing] = await db
      .select({ id: emailCampaigns.id })
      .from(emailCampaigns)
      .where(eq(emailCampaigns.instantlyCampaignId, rc.id))
      .limit(1);
    if (existing) continue;
    await db.insert(emailCampaigns).values({
      name: rc.name,
      status: mapRemoteStatus(rc.status),
      instantlyCampaignId: rc.id,
      createdBy: "instantly-sync",
    });
    imported++;
  }

  await saveInstantlyState({
    connected: true,
    lastSyncedAt: new Date().toISOString(),
    accountCount,
    campaignCount: remoteCampaigns.length,
  });

  return NextResponse.json({
    accountsSynced: accountCount,
    campaignsFound: remoteCampaigns.length,
    campaignsImported: imported,
  });
}
