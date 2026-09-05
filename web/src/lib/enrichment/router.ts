import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { enrichmentProviders, enrichmentAttempts, contacts, contactEmails, contactPhones } from "@/db/schema";
import { getAdapter } from "./registry";
import { EnrichmentSearchInput, EnrichmentResult, ProviderOutcome } from "./types";
import { boostForAgreement } from "./confidence";

const RATE_LIMIT_PAUSE_MS = 5 * 60 * 1000;

export type EnrichOperation = "search_email" | "find_phone";

export interface RouterResult {
  success: boolean;
  outcome: "SUCCESS" | "NO_MATCH" | "EXHAUSTED";
  providerUsed?: string;
  attempts: number;
  result?: EnrichmentResult;
  triedProviders: { key: string; outcome: ProviderOutcome; errorMessage?: string }[];
}

async function countAttemptsSince(providerKey: string, since: Date): Promise<number> {
  const [{ value }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(enrichmentAttempts)
    .where(and(eq(enrichmentAttempts.provider, providerKey), sql`${enrichmentAttempts.createdAt} >= ${since}`));
  return Number(value);
}

async function updateProviderAfterAttempt(
  providerKey: string,
  outcome: ProviderOutcome,
  errorMessage?: string
) {
  const now = new Date();
  const patch: Record<string, unknown> = {
    usageCount: sql`${enrichmentProviders.usageCount} + 1`,
    updatedAt: now,
  };

  if (outcome === "SUCCESS") {
    patch.status = "CONNECTED";
    patch.lastSuccessAt = now;
    patch.successCount = sql`${enrichmentProviders.successCount} + 1`;
  } else if (outcome === "RATE_LIMITED") {
    patch.status = "RATE_LIMITED";
    patch.rateLimitedUntil = new Date(Date.now() + RATE_LIMIT_PAUSE_MS);
    patch.failureCount = sql`${enrichmentProviders.failureCount} + 1`;
  } else if (outcome === "OUT_OF_CREDITS") {
    patch.status = "OUT_OF_CREDITS";
    patch.creditsRemaining = 0;
    patch.failureCount = sql`${enrichmentProviders.failureCount} + 1`;
  } else if (outcome === "AUTH_ERROR") {
    patch.status = "AUTH_ERROR";
    patch.lastErrorAt = now;
    patch.lastErrorMessage = errorMessage ?? "Authentication failed";
    patch.failureCount = sql`${enrichmentProviders.failureCount} + 1`;
  } else if (outcome === "FAILED") {
    patch.lastErrorAt = now;
    patch.lastErrorMessage = errorMessage ?? "Request failed";
    patch.failureCount = sql`${enrichmentProviders.failureCount} + 1`;
  }
  // NO_MATCH: just counts as usage, no status change — a working provider that found nothing.

  await db.update(enrichmentProviders).set(patch).where(eq(enrichmentProviders.key, providerKey));
}

async function saveEnrichmentResult(contactId: number, result: EnrichmentResult) {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) return;

  let bestEmail: { email: string; confidence: number } | null = null;
  for (const e of result.emails) {
    await db
      .insert(contactEmails)
      .values({
        contactId,
        email: e.email,
        type: "unknown",
        provider: result.provider,
        confidence: e.confidence,
        verificationStatus: e.verificationStatus ?? "unknown",
      })
      .onConflictDoNothing();
    if (!bestEmail || e.confidence > bestEmail.confidence) bestEmail = { email: e.email, confidence: e.confidence };
  }

  let bestPhone: { phone: string; confidence: number } | null = null;
  for (const p of result.phones) {
    await db
      .insert(contactPhones)
      .values({ contactId, phone: p.phone, type: "unknown", provider: result.provider, confidence: p.confidence })
      .onConflictDoNothing();
    if (!bestPhone || p.confidence > bestPhone.confidence) bestPhone = { phone: p.phone, confidence: p.confidence };
  }

  // How many distinct providers found the same best email — used to boost CRM confidence.
  let finalConfidence = result.confidence;
  if (bestEmail) {
    const [{ value }] = await db
      .select({ value: sql<number>`count(distinct ${contactEmails.provider})::int` })
      .from(contactEmails)
      .where(and(eq(contactEmails.contactId, contactId), eq(contactEmails.email, bestEmail.email)));
    finalConfidence = boostForAgreement(result.confidence, Number(value));
  }

  const contactPatch: Record<string, unknown> = {
    enrichmentStatus: "ENRICHED",
    enrichmentProvider: result.provider,
    enrichmentConfidence: finalConfidence,
    enrichedAt: new Date(),
    updatedAt: new Date(),
  };
  // Never overwrite an existing email/phone the contact already has — only fill if empty.
  if (bestEmail && !contact.email) contactPatch.email = bestEmail.email;
  if (bestPhone && !contact.phone) contactPatch.phone = bestPhone.phone;

  await db.update(contacts).set(contactPatch).where(eq(contacts.id, contactId));
}

/**
 * Tries enabled providers in priority order until one succeeds, skipping
 * providers that are disabled, rate-limited, out of credits, over their
 * daily/monthly cap, or not configured (missing API key).
 */
export async function routeEnrichment(
  contactId: number,
  input: EnrichmentSearchInput,
  operation: EnrichOperation = "search_email"
): Promise<RouterResult> {
  const providers = await db
    .select()
    .from(enrichmentProviders)
    .where(eq(enrichmentProviders.enabled, 1))
    .orderBy(enrichmentProviders.priority);

  const triedProviders: RouterResult["triedProviders"] = [];
  const now = new Date();

  for (const provider of providers) {
    if (provider.status === "AUTH_ERROR") continue;
    if (provider.rateLimitedUntil && provider.rateLimitedUntil > now) continue;
    if (provider.creditsRemaining !== null && provider.creditsRemaining <= 0) continue;
    if (operation === "find_phone" && !provider.supportsPhone) continue;

    if (provider.maxDailyUsage) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const used = await countAttemptsSince(provider.key, dayStart);
      if (used >= provider.maxDailyUsage) continue;
    }
    if (provider.maxMonthlyUsage) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const used = await countAttemptsSince(provider.key, monthStart);
      if (used >= provider.maxMonthlyUsage) continue;
    }

    const adapter = getAdapter(provider.key);
    if (!adapter || !adapter.configured) continue;

    const fn = operation === "find_phone" ? adapter.findPhone?.bind(adapter) : adapter.searchContact.bind(adapter);
    if (!fn) continue;

    const callResult = await fn(input);
    triedProviders.push({ key: provider.key, outcome: callResult.outcome, errorMessage: callResult.errorMessage });

    await db.insert(enrichmentAttempts).values({
      contactId,
      provider: provider.key,
      operation,
      outcome: callResult.outcome,
      resultSummary: callResult.result ? { confidence: callResult.result.confidence, emailCount: callResult.result.emails.length, phoneCount: callResult.result.phones.length } : undefined,
      confidence: callResult.result?.confidence !== undefined ? Math.round(callResult.result.confidence) : undefined,
      creditsUsed: Math.round(Number(callResult.creditsUsed ?? 0)) || 0,
      durationMs: callResult.durationMs,
      errorMessage: callResult.errorMessage,
    });

    await updateProviderAfterAttempt(provider.key, callResult.outcome, callResult.errorMessage);

    if (callResult.outcome === "SUCCESS" && callResult.result) {
      await saveEnrichmentResult(contactId, callResult.result);
      return { success: true, outcome: "SUCCESS", providerUsed: provider.key, attempts: triedProviders.length, result: callResult.result, triedProviders };
    }
    // NO_MATCH, RATE_LIMITED, OUT_OF_CREDITS, AUTH_ERROR, FAILED all fall through to the next provider.
  }

  const anyNoMatch = triedProviders.some((t) => t.outcome === "NO_MATCH");
  return {
    success: false,
    outcome: anyNoMatch ? "NO_MATCH" : "EXHAUSTED",
    attempts: triedProviders.length,
    triedProviders,
  };
}
