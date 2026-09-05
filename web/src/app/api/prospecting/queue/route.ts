import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("listId") ? Number(searchParams.get("listId")) : null;
  const limit = Math.min(200, Number(searchParams.get("limit") ?? "50"));

  const rows = await db.execute<{
    id: number;
    first_name: string;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    company_name: string | null;
    lead_status: string;
    call_attempts: number;
    last_called_at: string | null;
    next_follow_up_at: string | null;
  }>(sql`
    SELECT c.id, c.first_name, c.last_name, c.phone, c.email, co.name AS company_name,
           c.lead_status, c.call_attempts, c.last_called_at, c.next_follow_up_at
    FROM contacts c
    LEFT JOIN companies co ON c.company_id = co.id
    ${listId ? sql`INNER JOIN list_memberships lm ON lm.contact_id = c.id AND lm.list_id = ${listId}` : sql``}
    WHERE c.phone IS NOT NULL AND c.phone != ''
      AND c.lead_status != 'Customer'
      AND (c.last_called_at IS NULL OR c.last_called_at::date < now()::date)
    ORDER BY
      (c.next_follow_up_at IS NOT NULL AND c.next_follow_up_at <= now()) DESC,
      CASE c.lead_status WHEN 'Hot' THEN 0 WHEN 'Warm' THEN 1 ELSE 2 END,
      c.created_at ASC
    LIMIT ${limit}
  `);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      email: r.email,
      companyName: r.company_name,
      leadStatus: r.lead_status,
      callAttempts: r.call_attempts,
      lastCalledAt: r.last_called_at,
      nextFollowUpAt: r.next_follow_up_at,
    }))
  );
}
