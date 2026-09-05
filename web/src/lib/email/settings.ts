import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

/** Connection/sync metadata only — the API key itself lives in INSTANTLY_API_KEY and is never stored here. */
export type InstantlyConnectionState = {
  connected: boolean;
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  accountCount: number;
  campaignCount: number;
};

export const DEFAULT_INSTANTLY_STATE: InstantlyConnectionState = {
  connected: false,
  lastTestedAt: null,
  lastSyncedAt: null,
  accountCount: 0,
  campaignCount: 0,
};

export async function getInstantlyState(): Promise<InstantlyConnectionState> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "instantly")).limit(1);
  return { ...DEFAULT_INSTANTLY_STATE, ...(row?.value as Partial<InstantlyConnectionState> | undefined) };
}

export async function saveInstantlyState(value: Partial<InstantlyConnectionState>) {
  const current = await getInstantlyState();
  const merged = { ...current, ...value };
  await db
    .insert(settings)
    .values({ key: "instantly", value: merged })
    .onConflictDoUpdate({ target: settings.key, set: { value: merged, updatedAt: new Date() } });
  return merged;
}
