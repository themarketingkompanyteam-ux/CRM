import { sql } from "drizzle-orm";
import { db } from "@/db";

export type UncontactedContact = {
  id: number;
  firstName: string;
  lastName: string | null;
  email: string;
  companyName: string | null;
};

/**
 * Picks up to `limit` contacts who have never been sent a campaign email (via any mailbox, any
 * sequence — checked against mailbox_send_log directly, not just this sequence's own
 * enrollments) and aren't currently mid-sequence anywhere else. This is what makes "give me N
 * new leads" actually mean new — already-contacted leads never resurface.
 */
export async function getUncontactedContacts(limit: number): Promise<UncontactedContact[]> {
  const rows = await db.execute<{
    id: number;
    first_name: string;
    last_name: string | null;
    email: string;
    company_name: string | null;
  }>(sql`
    SELECT c.id, c.first_name, c.last_name, c.email, co.name AS company_name
    FROM contacts c
    LEFT JOIN companies co ON c.company_id = co.id
    WHERE c.email IS NOT NULL
      AND c.email_unsubscribed = 0
      AND c.email_bounced = 0
      AND c.do_not_contact = 0
      AND NOT EXISTS (SELECT 1 FROM mailbox_send_log WHERE mailbox_send_log.contact_id = c.id AND mailbox_send_log.status = 'sent')
      AND NOT EXISTS (SELECT 1 FROM sequence_enrollments WHERE sequence_enrollments.contact_id = c.id AND sequence_enrollments.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM email_campaign_leads WHERE email_campaign_leads.contact_id = c.id AND email_campaign_leads.status != 'pending')
    ORDER BY c.id ASC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    companyName: r.company_name,
  }));
}

/** Total count of contacts still eligible to be auto-picked — powers the "X leads available" preview. */
export async function countUncontactedContacts(): Promise<number> {
  const [row] = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM contacts c
    WHERE c.email IS NOT NULL
      AND c.email_unsubscribed = 0
      AND c.email_bounced = 0
      AND c.do_not_contact = 0
      AND NOT EXISTS (SELECT 1 FROM mailbox_send_log WHERE mailbox_send_log.contact_id = c.id AND mailbox_send_log.status = 'sent')
      AND NOT EXISTS (SELECT 1 FROM sequence_enrollments WHERE sequence_enrollments.contact_id = c.id AND sequence_enrollments.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM email_campaign_leads WHERE email_campaign_leads.contact_id = c.id AND email_campaign_leads.status != 'pending')
  `);
  return row?.count ?? 0;
}
