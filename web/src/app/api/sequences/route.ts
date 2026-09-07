import { NextRequest, NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { sequences } from "@/db/schema";

export async function GET() {
  const rows = await db
    .select({
      id: sequences.id,
      name: sequences.name,
      description: sequences.description,
      status: sequences.status,
      createdAt: sequences.createdAt,
      stepCount: sql<number>`(SELECT COUNT(*) FROM sequence_steps WHERE sequence_id = ${sequences.id})::int`,
      activeEnrollments: sql<number>`(SELECT COUNT(*) FROM sequence_enrollments WHERE sequence_id = ${sequences.id} AND status = 'active')::int`,
      completedEnrollments: sql<number>`(SELECT COUNT(*) FROM sequence_enrollments WHERE sequence_id = ${sequences.id} AND status = 'completed')::int`,
    })
    .from(sequences)
    .orderBy(desc(sequences.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "Sequence name is required" }, { status: 400 });
  const [created] = await db.insert(sequences).values({ name: body.name, description: body.description ?? null }).returning();
  return NextResponse.json(created);
}
