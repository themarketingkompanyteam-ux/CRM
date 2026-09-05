import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { growthIntelligenceQueue } from "@/queue/growth-intelligence-queue";
import { getGrowthIntelligenceSettings, countAiRunsToday } from "./settings";

/**
 * Called whenever a contact's leadStatus changes. Enqueues the Growth
 * Intelligence pipeline if it becomes HOT (or WARM, if that's enabled),
 * respecting the daily limit and skipping contacts already analyzed and
 * still fresh (not expired) or already in flight.
 */
export async function maybeTriggerGrowthIntelligence(contactId: number, newLeadStatus: string) {
  const settings = await getGrowthIntelligenceSettings();

  const eligible =
    (newLeadStatus === "Hot" && settings.autoAnalyzeHot) ||
    (newLeadStatus === "Warm" && settings.autoAnalyzeWarm);
  if (!eligible) return { triggered: false, reason: "not eligible" };

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) return { triggered: false, reason: "contact not found" };

  // Already queued/running, or completed and still within the refresh window.
  const inFlight = ["QUEUED", "RESEARCHING", "ANALYZING", "OPPORTUNITIES_FOUND", "SCORED", "SALES_READY"].includes(
    contact.aiStatus
  );
  const freshlyCompleted =
    contact.aiStatus === "COMPLETED" &&
    contact.aiExpiresAt &&
    new Date(contact.aiExpiresAt) > new Date();
  if (inFlight || freshlyCompleted) {
    return { triggered: false, reason: "already analyzed or in progress" };
  }

  const usedToday = await countAiRunsToday();
  if (usedToday >= settings.dailyAiLimit) {
    await db.update(contacts).set({ aiStatus: "QUEUED" }).where(eq(contacts.id, contactId));
    return { triggered: false, reason: "daily AI limit reached — left queued" };
  }

  await db.update(contacts).set({ aiStatus: "QUEUED", updatedAt: new Date() }).where(eq(contacts.id, contactId));
  await growthIntelligenceQueue.add("analyze", { contactId });
  return { triggered: true };
}
