import { eq, inArray, and } from "drizzle-orm";
import { db } from "@/db";
import { contacts, companies, emailCampaigns, emailCampaignSteps, emailCampaignLeads, emailSendingAccounts } from "@/db/schema";
import { instantlyProvider } from "./instantly";

export type LeadEligibility = {
  contactId: number;
  eligible: boolean;
  reason?: "missing_email" | "unsubscribed" | "bounced" | "do_not_contact" | "already_in_campaign";
};

export type ValidationSummary = {
  selected: number;
  eligible: number;
  missingEmail: number;
  unsubscribed: number;
  bounced: number;
  doNotContact: number;
  alreadyInCampaign: number;
  eligibleContactIds: number[];
};

/** CRM-level suppression + eligibility check — runs before anything is pushed to Instantly. */
export async function validateLeadsForCampaign(campaignId: number, contactIds: number[]): Promise<ValidationSummary> {
  if (contactIds.length === 0) {
    return {
      selected: 0,
      eligible: 0,
      missingEmail: 0,
      unsubscribed: 0,
      bounced: 0,
      doNotContact: 0,
      alreadyInCampaign: 0,
      eligibleContactIds: [],
    };
  }

  const rows = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      emailUnsubscribed: contacts.emailUnsubscribed,
      emailBounced: contacts.emailBounced,
      doNotContact: contacts.doNotContact,
    })
    .from(contacts)
    .where(inArray(contacts.id, contactIds));

  const existingMemberships = await db
    .select({ contactId: emailCampaignLeads.contactId })
    .from(emailCampaignLeads)
    .where(and(eq(emailCampaignLeads.campaignId, campaignId), inArray(emailCampaignLeads.contactId, contactIds)));
  const alreadyIn = new Set(existingMemberships.map((m) => m.contactId));

  const summary: ValidationSummary = {
    selected: contactIds.length,
    eligible: 0,
    missingEmail: 0,
    unsubscribed: 0,
    bounced: 0,
    doNotContact: 0,
    alreadyInCampaign: 0,
    eligibleContactIds: [],
  };

  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of contactIds) {
    const c = byId.get(id);
    if (!c) continue;
    if (alreadyIn.has(id)) {
      summary.alreadyInCampaign++;
      continue;
    }
    if (!c.email) {
      summary.missingEmail++;
      continue;
    }
    if (c.emailUnsubscribed) {
      summary.unsubscribed++;
      continue;
    }
    if (c.emailBounced) {
      summary.bounced++;
      continue;
    }
    if (c.doNotContact) {
      summary.doNotContact++;
      continue;
    }
    summary.eligible++;
    summary.eligibleContactIds.push(id);
  }

  return summary;
}

/** Adds already-validated eligible contacts as `pending` local rows (not yet pushed to Instantly). */
export async function addEligibleLeadsToCampaign(campaignId: number, contactIds: number[]) {
  if (contactIds.length === 0) return 0;
  const values = contactIds.map((contactId) => ({ campaignId, contactId, status: "pending" as const }));
  const inserted = await db.insert(emailCampaignLeads).values(values).onConflictDoNothing().returning({ id: emailCampaignLeads.id });
  return inserted.length;
}

/** Pushes all `pending` local leads for a campaign into the live Instantly campaign. */
export async function pushPendingLeadsToInstantly(campaignId: number) {
  const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaignId)).limit(1);
  if (!campaign || !campaign.instantlyCampaignId) {
    throw new Error("Campaign has not been launched on Instantly yet");
  }

  const pendingRows = await db
    .select({
      leadRowId: emailCampaignLeads.id,
      contactId: emailCampaignLeads.contactId,
    })
    .from(emailCampaignLeads)
    .where(and(eq(emailCampaignLeads.campaignId, campaignId), eq(emailCampaignLeads.status, "pending")));

  if (pendingRows.length === 0) return { pushed: 0 };

  const contactRows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      jobTitle: contacts.jobTitle,
      website: contacts.website,
      companyName: companies.name,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(
      inArray(
        contacts.id,
        pendingRows.map((r) => r.contactId)
      )
    );

  const contactById = new Map(contactRows.map((c) => [c.id, c]));
  const leadParams = pendingRows
    .map((r) => {
      const c = contactById.get(r.contactId);
      if (!c?.email) return null;
      return {
        contactId: r.contactId,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        companyName: c.companyName,
        jobTitle: c.jobTitle,
        website: c.website,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const BATCH = 200;
  let uploaded = 0;
  for (let i = 0; i < leadParams.length; i += BATCH) {
    const batch = leadParams.slice(i, i + BATCH);
    const result = await instantlyProvider.addLeads(campaign.instantlyCampaignId, batch);
    uploaded += result.leadsUploaded;
    const createdByEmail = new Map(result.createdLeads.map((l) => [l.email, l.id]));
    for (const lead of batch) {
      const instantlyLeadId = createdByEmail.get(lead.email) ?? null;
      await db
        .update(emailCampaignLeads)
        .set({ status: "added", instantlyLeadId, lastEventAt: new Date() })
        .where(and(eq(emailCampaignLeads.campaignId, campaignId), eq(emailCampaignLeads.contactId, lead.contactId)));
    }
  }

  return { pushed: uploaded };
}

export async function syncSendingAccounts() {
  const accounts = await instantlyProvider.listAccounts();
  for (const a of accounts) {
    await db
      .insert(emailSendingAccounts)
      .values({
        email: a.email,
        status: a.status,
        statusLabel: a.statusLabel,
        warmupStatus: a.warmupStatus,
        dailyLimit: a.dailyLimit,
        tags: a.tags,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: emailSendingAccounts.email,
        set: {
          status: a.status,
          statusLabel: a.statusLabel,
          warmupStatus: a.warmupStatus,
          dailyLimit: a.dailyLimit,
          tags: a.tags,
          syncedAt: new Date(),
        },
      });
  }
  return accounts.length;
}

export async function syncCampaignAnalytics(campaignId: number) {
  const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaignId)).limit(1);
  if (!campaign?.instantlyCampaignId) return null;
  const analytics = await instantlyProvider.getCampaignAnalytics(campaign.instantlyCampaignId);
  if (analytics) {
    await db.update(emailCampaigns).set({ lastSyncedAt: new Date() }).where(eq(emailCampaigns.id, campaignId));
  }
  return analytics;
}

/** Checks the launch preconditions from spec section 15 — throws with a human-readable reason if not ready. */
export async function assertCampaignLaunchable(campaignId: number) {
  const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaignId)).limit(1);
  if (!campaign) throw new Error("Campaign not found");

  const steps = await db.select().from(emailCampaignSteps).where(eq(emailCampaignSteps.campaignId, campaignId));
  if (steps.length === 0) throw new Error("Campaign has no email sequence steps");

  if (!campaign.sendingAccountEmails || campaign.sendingAccountEmails.length === 0) {
    throw new Error("No sending accounts selected");
  }

  const accounts = await db
    .select()
    .from(emailSendingAccounts)
    .where(inArray(emailSendingAccounts.email, campaign.sendingAccountEmails));
  const healthy = accounts.filter((a) => a.status === 1);
  if (healthy.length === 0) {
    throw new Error("No healthy sending accounts available — reconnect or check account status in Instantly");
  }

  const leadCount = await db
    .select({ id: emailCampaignLeads.id })
    .from(emailCampaignLeads)
    .where(eq(emailCampaignLeads.campaignId, campaignId));
  if (leadCount.length === 0) throw new Error("Campaign has no leads");

  return { campaign, steps, healthyAccounts: healthy };
}
