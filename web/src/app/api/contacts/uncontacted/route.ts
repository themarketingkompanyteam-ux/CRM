import { NextRequest, NextResponse } from "next/server";
import { getUncontactedContacts, countUncontactedContacts } from "@/lib/mailbox/audience";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const countOnly = searchParams.get("countOnly") === "1";

  if (countOnly) {
    const count = await countUncontactedContacts();
    return NextResponse.json({ count });
  }

  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 5000);
  const contacts = await getUncontactedContacts(limit);
  return NextResponse.json(contacts);
}
