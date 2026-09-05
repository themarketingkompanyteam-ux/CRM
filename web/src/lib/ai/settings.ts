import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export type GrowthIntelligenceSettings = {
  autoAnalyzeHot: boolean;
  autoAnalyzeWarm: boolean;
  autoEnrichHot: boolean;
  autoGenerateSalesBrief: boolean;
  autoGenerateOutreach: boolean;
  autoPushToProspecting: boolean;
  minOpportunityScore: number;
  dailyAiLimit: number;
  refreshDays: number;
};

export const DEFAULT_GI_SETTINGS: GrowthIntelligenceSettings = {
  autoAnalyzeHot: true,
  autoAnalyzeWarm: false,
  autoEnrichHot: true,
  autoGenerateSalesBrief: true,
  autoGenerateOutreach: true,
  autoPushToProspecting: true,
  minOpportunityScore: 60,
  dailyAiLimit: 50,
  refreshDays: 14,
};

export type IcpConfig = {
  targetIndustries: string[];
  targetSizes: string[];
  targetLocations: string[];
  minRevenue: string;
  preferredServices: string[];
  disallowedIndustries: string[];
  preferredRoles: string[];
};

export const DEFAULT_ICP: IcpConfig = {
  targetIndustries: [],
  targetSizes: [],
  targetLocations: [],
  minRevenue: "",
  preferredServices: [],
  disallowedIndustries: [],
  preferredRoles: [],
};

export async function getGrowthIntelligenceSettings(): Promise<GrowthIntelligenceSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "growth_intelligence")).limit(1);
  return { ...DEFAULT_GI_SETTINGS, ...(row?.value as Partial<GrowthIntelligenceSettings> | undefined) };
}

export async function saveGrowthIntelligenceSettings(value: Partial<GrowthIntelligenceSettings>) {
  const current = await getGrowthIntelligenceSettings();
  const merged = { ...current, ...value };
  await db
    .insert(settings)
    .values({ key: "growth_intelligence", value: merged })
    .onConflictDoUpdate({ target: settings.key, set: { value: merged, updatedAt: new Date() } });
  return merged;
}

export async function getIcpConfig(): Promise<IcpConfig> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "icp")).limit(1);
  return { ...DEFAULT_ICP, ...(row?.value as Partial<IcpConfig> | undefined) };
}

export async function saveIcpConfig(value: Partial<IcpConfig>) {
  const current = await getIcpConfig();
  const merged = { ...current, ...value };
  await db
    .insert(settings)
    .values({ key: "icp", value: merged })
    .onConflictDoUpdate({ target: settings.key, set: { value: merged, updatedAt: new Date() } });
  return merged;
}

/** Counts successful+failed AI pipeline runs started today, for the daily limit check. */
export async function countAiRunsToday(): Promise<number> {
  const { sql } = await import("drizzle-orm");
  const { aiUsageLog } = await import("@/db/schema");
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const [{ value }] = await db
    .select({ value: sql<number>`count(distinct contact_id)::int` })
    .from(aiUsageLog)
    .where(sql`${aiUsageLog.operation} = 'research' AND ${aiUsageLog.createdAt} >= ${dayStart.toISOString()}`);
  return Number(value);
}
