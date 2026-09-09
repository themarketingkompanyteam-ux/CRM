import { NextResponse } from "next/server";
import { hostingerClient } from "@/lib/hostinger/client";

export async function GET() {
  const domains = await hostingerClient.listDomains();
  return NextResponse.json(domains);
}
