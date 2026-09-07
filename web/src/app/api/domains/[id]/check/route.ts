import { NextRequest, NextResponse } from "next/server";
import { runDomainCheck } from "@/lib/domains/service";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const updated = await runDomainCheck(id);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}
