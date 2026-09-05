import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  const [row] = await db.execute<{ hot: number; warm: number; cold: number; total: number }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE lead_status = 'Hot' AND enrichment_status = 'NOT_ENRICHED')::int AS hot,
      COUNT(*) FILTER (WHERE lead_status = 'Warm' AND enrichment_status = 'NOT_ENRICHED')::int AS warm,
      COUNT(*) FILTER (WHERE lead_status = 'Cold' AND enrichment_status = 'NOT_ENRICHED')::int AS cold,
      COUNT(*) FILTER (WHERE lead_status IN ('Hot','Warm','Cold') AND enrichment_status = 'NOT_ENRICHED')::int AS total
    FROM contacts
  `);

  return NextResponse.json({
    hot: Number(row.hot),
    warm: Number(row.warm),
    cold: Number(row.cold),
    total: Number(row.total),
  });
}
