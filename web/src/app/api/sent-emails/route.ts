import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

type SentEmailRow = {
  id: number;
  contact_id: number;
  first_name: string;
  last_name: string | null;
  email: string | null;
  company_name: string | null;
  mailbox_email: string;
  sequence_name: string | null;
  subject: string;
  status: string;
  error: string | null;
  sent_at: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const rows = await db.execute<SentEmailRow>(sql`
    SELECT
      l.id, l.contact_id, c.first_name, c.last_name, c.email,
      co.name AS company_name,
      mb.email AS mailbox_email,
      seq.name AS sequence_name,
      l.subject, l.status, l.error, l.sent_at
    FROM mailbox_send_log l
    JOIN contacts c ON l.contact_id = c.id
    LEFT JOIN companies co ON c.company_id = co.id
    JOIN mailboxes mb ON l.mailbox_id = mb.id
    LEFT JOIN sequence_enrollments se ON l.sequence_enrollment_id = se.id
    LEFT JOIN sequences seq ON se.sequence_id = seq.id
    ${status ? sql`WHERE l.status = ${status}` : sql``}
    ORDER BY l.sent_at DESC
    LIMIT 500
  `);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      contactId: r.contact_id,
      name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
      email: r.email,
      companyName: r.company_name,
      mailboxEmail: r.mailbox_email,
      sequenceName: r.sequence_name,
      subject: r.subject,
      status: r.status,
      error: r.error,
      sentAt: r.sent_at,
    }))
  );
}
