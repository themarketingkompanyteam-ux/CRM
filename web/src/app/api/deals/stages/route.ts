import { NextResponse } from "next/server";
import { STAGES } from "../route";

export async function GET() {
  return NextResponse.json({ stages: STAGES });
}
