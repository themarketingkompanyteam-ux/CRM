import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { contacts, emailCampaigns, emailCampaignLeads, activities } from "@/db/schema";
import { maybeTriggerGrowthIntelligence } from "@/lib/ai/automation";

// Instantly does not sign webhook payloads, so we authenticate via a shared secret header
// we set ourselves when registering the webhook (see /api/integrations/instantly/webhook).
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.INSTANTLY_WEBHOOK_SECRET;
  if (!expected) return false;
  return request.headers.get("x-webhook-secret") === expected;
}

const EVENT_TO_LEAD_STATUS: Record<string, string> = {
  email_sent: "sent",
  email_opened: "opened",
  email_link_clicked: "clicked",
  reply_received: "replied",
  email_bounced: "bounced",
  lead_unsubscribed: "unsubscribed",
};

const ACTIVITY_LABELS: Record<string, string> = {
  email_sent: "Email Sent",
  email_opened: "Email Opened",
  email_link_clicked: "Link Clicked",
  reply_received: "Reply Received",
  email_bounced: "Email Bounced",
  lead_unsubscribed: "Unsubscribed",
  lead_interested: "Marked Interested",
  lead_not_interested: "Marked Not Interested",
  lead_meeting_booked: "Meeting Booked",
};

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = String(body.event_type ?? body.event ?? "");
  const instantlyCampaignId = String(body.campaign_id ?? body.campaign ?? "");
  const leadEmail = String(body.lead_email ?? body.email ?? "");
  const instantlyLeadId = body.lead_id != null ? String(body.lead_id) : null;

  if (!eventType) {
    return NextResponse.json({ error: "Missing event_type" }, { status: 400 });
  }

  const [campaign] = instantlyCampaignId
    ? await db.select().from(emailCampaigns).where(eq(emailCampaigns.instantlyCampaignId, instantlyCampaignId)).limit(1)
    : [];

  let campaignLead;
  if (campaign) {
    if (instantlyLeadId) {
      [campaignLead] = await db
        .select()
        .from(emailCampaignLeads)
        .where(and(eq(emailCampaignLeads.campaignId, campaign.id), eq(emailCampaignLeads.instantlyLeadId, instantlyLeadId)))
        .limit(1);
    }
    if (!campaignLead && leadEmail) {
      const [contact] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.email, leadEmail)).limit(1);
      if (contact) {
        [campaignLead] = await db
          .select()
          .from(emailCampaignLeads)
          .where(and(eq(emailCampaignLeads.campaignId, campaign.id), eq(emailCampaignLeads.contactId, contact.id)))
          .limit(1);
      }
    }
  }

  if (campaignLead) {
    const nextStatus = EVENT_TO_LEAD_STATUS[eventType];
    if (nextStatus) {
      await db
        .update(emailCampaignLeads)
        .set({ status: nextStatus, lastEventAt: new Date(), instantlyLeadId: instantlyLeadId ?? campaignLead.instantlyLeadId })
        .where(eq(emailCampaignLeads.id, campaignLead.id));
    }

    const activityLabel = ACTIVITY_LABELS[eventType];
    if (activityLabel) {
      await db.insert(activities).values({
        contactId: campaignLead.contactId,
        type: "email_campaign",
        body: `${activityLabel}${campaign ? ` — ${campaign.name}` : ""}`,
      });
    }

    // Reply received: stop follow-ups is already configured on the Instantly campaign itself
    // (stop_on_reply), this only reflects that status back into the CRM contact record.
    if (eventType === "reply_received") {
      await db.update(contacts).set({ emailStatus: "replied", updatedAt: new Date() }).where(eq(contacts.id, campaignLead.contactId));
    } else if (eventType === "email_bounced") {
      await db.update(contacts).set({ emailStatus: "bounced", emailBounced: 1, updatedAt: new Date() }).where(eq(contacts.id, campaignLead.contactId));
    } else if (eventType === "lead_unsubscribed") {
      await db.update(contacts).set({ emailStatus: "unsubscribed", emailUnsubscribed: 1, updatedAt: new Date() }).where(eq(contacts.id, campaignLead.contactId));
    } else if (eventType === "lead_interested") {
      await db.update(contacts).set({ leadStatus: "Hot", updatedAt: new Date() }).where(eq(contacts.id, campaignLead.contactId));
      maybeTriggerGrowthIntelligence(campaignLead.contactId, "Hot").catch((err) =>
        console.error("Growth Intelligence trigger from Instantly webhook failed", err)
      );
    }
  }

  return NextResponse.json({ ok: true });
}
