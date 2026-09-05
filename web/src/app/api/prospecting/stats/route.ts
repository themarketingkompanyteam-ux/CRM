import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  const [hot] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int as count FROM contacts WHERE lead_status = 'Hot'`
  );
  const [warm] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int as count FROM contacts WHERE lead_status = 'Warm'`
  );
  const [toCall] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int as count FROM contacts
        WHERE phone IS NOT NULL AND phone != ''
        AND (last_called_at IS NULL OR last_called_at::date < now()::date)
        AND lead_status != 'Customer'`
  );
  const [callBack] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int as count FROM contacts
        WHERE next_follow_up_at IS NOT NULL AND next_follow_up_at <= now()`
  );
  const [booked] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int as count FROM calls
        WHERE outcome = 'Booked Call' AND created_at::date = now()::date`
  );

  return NextResponse.json({
    hot: Number(hot.count),
    warm: Number(warm.count),
    toCall: Number(toCall.count),
    callBack: Number(callBack.count),
    booked: Number(booked.count),
  });
}
