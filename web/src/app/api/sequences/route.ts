import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { sequences } from "@/db/schema";

type SequenceRow = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  step_count: number;
  active_enrollments: number;
  completed_enrollments: number;
};

export async function GET() {
  // Raw query with explicitly table-qualified columns — see /api/domains/route.ts for why:
  // drizzle's query builder mis-scopes a drizzle column object interpolated inside a
  // correlated subquery's sql template and silently returns 0 instead of the real count.
  const rows = await db.execute<SequenceRow>(sql`
    SELECT
      s.id, s.name, s.description, s.status, s.created_at,
      (SELECT COUNT(*) FROM sequence_steps WHERE sequence_steps.sequence_id = s.id)::int AS step_count,
      (SELECT COUNT(*) FROM sequence_enrollments WHERE sequence_enrollments.sequence_id = s.id AND status = 'active')::int AS active_enrollments,
      (SELECT COUNT(*) FROM sequence_enrollments WHERE sequence_enrollments.sequence_id = s.id AND status = 'completed')::int AS completed_enrollments
    FROM sequences s
    ORDER BY s.created_at DESC
  `);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      createdAt: r.created_at,
      stepCount: r.step_count,
      activeEnrollments: r.active_enrollments,
      completedEnrollments: r.completed_enrollments,
    }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "Sequence name is required" }, { status: 400 });
  const [created] = await db.insert(sequences).values({ name: body.name, description: body.description ?? null }).returning();
  return NextResponse.json(created);
}
