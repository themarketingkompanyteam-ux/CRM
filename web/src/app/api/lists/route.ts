import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { lists } from "@/db/schema";

export async function GET() {
  const rows = await db.execute<{ id: number; name: string; contact_count: number }>(sql`
    SELECT l.id, l.name,
      (SELECT COUNT(*)::int FROM list_memberships WHERE list_id = l.id) AS contact_count
    FROM lists l
    ORDER BY l.name ASC
  `);
  return NextResponse.json(
    rows.map((r) => ({ id: r.id, name: r.name, contactCount: Number(r.contact_count) }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const [row] = await db
    .insert(lists)
    .values({ name })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    const [existing] = await db
      .select()
      .from(lists)
      .where(sql`lower(${lists.name}) = ${name.toLowerCase()}`)
      .limit(1);
    return NextResponse.json({ status: "exists", id: existing?.id });
  }

  return NextResponse.json({ status: "saved", id: row.id });
}
