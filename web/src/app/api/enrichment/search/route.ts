import { NextRequest, NextResponse } from "next/server";
import { searchNewContact } from "@/lib/enrichment/search";

export async function POST(request: NextRequest) {
  const body = await request.json();

  const hasIdentifier =
    body.linkedinUrl || (body.firstName && body.lastName && (body.companyName || body.companyDomain));
  if (!hasIdentifier) {
    return NextResponse.json(
      { error: "Provide a LinkedIn URL, or a full name plus company/domain — name alone isn't a confident identifier" },
      { status: 400 }
    );
  }

  const candidate = await searchNewContact({
    firstName: body.firstName,
    lastName: body.lastName,
    companyName: body.companyName,
    companyDomain: body.companyDomain,
    jobTitle: body.jobTitle,
    location: body.location,
    linkedinUrl: body.linkedinUrl,
    email: body.email,
    phone: body.phone,
  });

  return NextResponse.json(candidate);
}
