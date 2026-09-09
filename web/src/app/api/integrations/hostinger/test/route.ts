import { NextResponse } from "next/server";
import { hostingerClient } from "@/lib/hostinger/client";

export async function POST() {
  const result = await hostingerClient.testConnection();
  return NextResponse.json(result);
}
