import { NextRequest, NextResponse } from "next/server";
import { getGrowthIntelligenceSettings, saveGrowthIntelligenceSettings, getIcpConfig, saveIcpConfig } from "@/lib/ai/settings";

export async function GET() {
  const [settings, icp] = await Promise.all([getGrowthIntelligenceSettings(), getIcpConfig()]);
  return NextResponse.json({ settings, icp });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const [settings, icp] = await Promise.all([
    body.settings ? saveGrowthIntelligenceSettings(body.settings) : getGrowthIntelligenceSettings(),
    body.icp ? saveIcpConfig(body.icp) : getIcpConfig(),
  ]);
  return NextResponse.json({ settings, icp });
}
