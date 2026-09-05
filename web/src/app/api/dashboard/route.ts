import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

const STAGES = ["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

export async function GET() {
  const [contactCount] = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::int as count FROM contacts`
  );
  const [companyCount] = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::int as count FROM companies`
  );
  const [leadsToday] = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::int as count FROM contacts WHERE created_at::date = now()::date`
  );
  const [pipelineValue] = await db.execute<{ sum: string }>(
    sql`SELECT COALESCE(SUM(value), 0) as sum FROM deals WHERE stage NOT IN ('Won', 'Lost')`
  );
  const [revenueWon] = await db.execute<{ sum: string }>(
    sql`SELECT COALESCE(SUM(value), 0) as sum FROM deals WHERE stage = 'Won'`
  );
  const [revenueLost] = await db.execute<{ sum: string }>(
    sql`SELECT COALESCE(SUM(value), 0) as sum FROM deals WHERE stage = 'Lost'`
  );
  const [openDeals] = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::int as count FROM deals WHERE stage NOT IN ('Won', 'Lost')`
  );
  const [dealsAtRisk] = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::int as count FROM deals WHERE stage NOT IN ('Won', 'Lost') AND updated_at < now() - interval '14 days'`
  );
  const [wonCount] = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::int as count FROM deals WHERE stage = 'Won'`
  );
  const [totalDeals] = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::int as count FROM deals`
  );

  const byStageRows = await db.execute<{
    stage: string;
    count: string;
    value: string;
  }>(sql`SELECT stage, COUNT(*)::int as count, COALESCE(SUM(value), 0) as value FROM deals GROUP BY stage`);

  const byStage: Record<string, { count: number; value: number }> = {};
  for (const s of STAGES) byStage[s] = { count: 0, value: 0 };
  for (const row of byStageRows) {
    byStage[row.stage] = { count: Number(row.count), value: Number(row.value) };
  }

  const total = Number(totalDeals.count);
  const won = Number(wonCount.count);

  return NextResponse.json({
    total_contacts: Number(contactCount.count),
    total_companies: Number(companyCount.count),
    leads_today: Number(leadsToday.count),
    pipeline_value: Number(pipelineValue.sum),
    revenue_won: Number(revenueWon.sum),
    revenue_lost: Number(revenueLost.sum),
    open_deals: Number(openDeals.count),
    deals_at_risk: Number(dealsAtRisk.count),
    conversion_rate: total ? Math.round((won / total) * 1000) / 10 : 0,
    by_stage: byStage,
  });
}
