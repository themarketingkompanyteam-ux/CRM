import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, companies, mailboxes, mailboxSendLog, activities } from "@/db/schema";
import { pickMailboxForSend, effectiveDailyLimit } from "./rotation";
import { providerFor } from "./provider";
import { renderTemplate } from "./personalize";

export type SendOutcome =
  | { ok: true; mailboxId: number; providerMessageId?: string }
  | { ok: false; reason: string };

/**
 * Sends one email to one contact through a rotated, rate-limited mailbox, with a full
 * suppression check first. Mailbox capacity is claimed atomically inside a transaction
 * (SELECT ... FOR UPDATE) before the network send, so concurrent workers can never both
 * claim the last slot under a mailbox's daily cap.
 */
export async function sendToContact(
  contactId: number,
  template: { subject: string; body: string },
  options?: { sequenceEnrollmentId?: number; candidateMailboxIds?: number[] }
): Promise<SendOutcome> {
  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      jobTitle: contacts.jobTitle,
      website: contacts.website,
      companyName: companies.name,
      emailUnsubscribed: contacts.emailUnsubscribed,
      emailBounced: contacts.emailBounced,
      doNotContact: contacts.doNotContact,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) return { ok: false, reason: "Contact not found" };
  if (!contact.email) return { ok: false, reason: "Contact has no email address" };
  if (contact.emailUnsubscribed) return { ok: false, reason: "Contact has unsubscribed" };
  if (contact.emailBounced) return { ok: false, reason: "Contact's email previously bounced" };
  if (contact.doNotContact) return { ok: false, reason: "Contact is marked Do Not Contact" };

  // Claim a mailbox + its daily slot atomically so concurrent sends can't both pass the cap check.
  const claimed = await db.transaction(async (tx) => {
    const candidate = await pickMailboxForSend(options?.candidateMailboxIds);
    if (!candidate) return null;

    const [locked] = await tx.execute<{ id: number; sent_today: number; warmup_status: string; health_status: string; warmup_daily_limit: number; campaign_daily_limit: number }>(
      sql`SELECT id, sent_today, warmup_status, health_status, warmup_daily_limit, campaign_daily_limit FROM mailboxes WHERE id = ${candidate.id} FOR UPDATE`
    );
    if (!locked) return null;
    const limit = effectiveDailyLimit({
      warmupStatus: locked.warmup_status,
      healthStatus: locked.health_status,
      warmupDailyLimit: locked.warmup_daily_limit,
      campaignDailyLimit: locked.campaign_daily_limit,
    });
    if (locked.sent_today >= limit) return null;

    await tx.update(mailboxes).set({ sentToday: sql`${mailboxes.sentToday} + 1` }).where(eq(mailboxes.id, locked.id));
    return candidate;
  });

  if (!claimed) return { ok: false, reason: "No eligible mailbox with remaining capacity" };

  const subject = renderTemplate(template.subject, contact);
  const body = renderTemplate(template.body, contact);
  const provider = providerFor(claimed);
  const result = await provider.sendEmail(claimed, { to: contact.email, subject, body });

  await db.insert(mailboxSendLog).values({
    mailboxId: claimed.id,
    contactId,
    sequenceEnrollmentId: options?.sequenceEnrollmentId ?? null,
    subject,
    status: result.ok ? "sent" : "failed",
    providerMessageId: result.providerMessageId ?? null,
    error: result.error ?? null,
  });

  if (!result.ok) {
    await db
      .update(mailboxes)
      .set({ lastConnectionError: result.error ?? null, updatedAt: new Date() })
      .where(eq(mailboxes.id, claimed.id));
    return { ok: false, reason: result.error ?? "Send failed" };
  }

  await db.insert(activities).values({
    contactId,
    type: "email_sent",
    body: `Email sent from ${claimed.email}: ${subject}`,
  });

  return { ok: true, mailboxId: claimed.id, providerMessageId: result.providerMessageId };
}
