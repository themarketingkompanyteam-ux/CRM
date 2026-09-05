import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { emailSendingAccounts } from "@/db/schema";

export async function GET() {
  const rows = await db.select().from(emailSendingAccounts).orderBy(desc(emailSendingAccounts.status));
  return NextResponse.json(rows);
}
