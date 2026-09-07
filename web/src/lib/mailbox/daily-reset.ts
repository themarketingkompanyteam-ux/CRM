import { db } from "@/db";
import { mailboxes } from "@/db/schema";

export async function resetDailyCounters() {
  await db.update(mailboxes).set({
    sentToday: 0,
    deliveredToday: 0,
    bouncedToday: 0,
    repliedToday: 0,
    unsubscribesToday: 0,
    countersResetAt: new Date(),
  });
}
