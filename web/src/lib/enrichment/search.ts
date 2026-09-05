import { eq } from "drizzle-orm";
import { db } from "@/db";
import { enrichmentProviders, enrichmentAttempts, enrichmentCandidates } from "@/db/schema";
import { getAdapter } from "./registry";
import { EnrichmentSearchInput } from "./types";
import { boostForAgreement } from "./confidence";

/**
 * Searches ALL enabled/eligible providers (not just the first success) and
 * merges results, since "Search New Contacts" is an explicit, user-initiated
 * credit spend where seeing provider agreement matters (spec section 17).
 * Results are saved as a review candidate, never inserted as a real contact.
 */
export async function searchNewContact(input: EnrichmentSearchInput) {
  const providers = await db
    .select()
    .from(enrichmentProviders)
    .where(eq(enrichmentProviders.enabled, 1))
    .orderBy(enrichmentProviders.priority);

  const now = new Date();
  const emailMap = new Map<string, { provider: string; confidence: number; verificationStatus?: string }[]>();
  const phoneMap = new Map<string, { provider: string; confidence: number }[]>();
  const sources: string[] = [];
  let firstName: string | undefined;
  let lastName: string | undefined;

  // Query eligible providers in parallel — several (BetterContact, Snov.io,
  // FullEnrich) are async/poll-based and can each take 30-60s; running them
  // sequentially in one HTTP request could take minutes. Parallel bounds the
  // total wait to the slowest single provider instead of their sum.
  const eligible = providers.filter((provider) => {
    if (provider.status === "AUTH_ERROR") return false;
    if (provider.rateLimitedUntil && provider.rateLimitedUntil > now) return false;
    if (provider.creditsRemaining !== null && provider.creditsRemaining <= 0) return false;
    const adapter = getAdapter(provider.key);
    return !!adapter?.configured;
  });

  const settled = await Promise.allSettled(
    eligible.map((provider) => getAdapter(provider.key)!.searchContact(input).then((callResult) => ({ provider, callResult })))
  );

  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue;
    const { provider, callResult } = outcome.value;

    await db.insert(enrichmentAttempts).values({
      contactId: null,
      provider: provider.key,
      operation: "search_email",
      outcome: callResult.outcome,
      confidence: callResult.result?.confidence !== undefined ? Math.round(callResult.result.confidence) : undefined,
      creditsUsed: Math.round(Number(callResult.creditsUsed ?? 0)) || 0,
      durationMs: callResult.durationMs,
      errorMessage: callResult.errorMessage,
    });

    if (callResult.outcome !== "SUCCESS" || !callResult.result) continue;

    sources.push(provider.key);
    firstName = firstName ?? callResult.result.firstName;
    lastName = lastName ?? callResult.result.lastName;

    for (const e of callResult.result.emails) {
      const list = emailMap.get(e.email) ?? [];
      list.push({ provider: provider.key, confidence: e.confidence, verificationStatus: e.verificationStatus });
      emailMap.set(e.email, list);
    }
    for (const p of callResult.result.phones) {
      const list = phoneMap.get(p.phone) ?? [];
      list.push({ provider: provider.key, confidence: p.confidence });
      phoneMap.set(p.phone, list);
    }
  }

  const emails = [...emailMap.entries()].map(([email, hits]) => {
    const bestConfidence = Math.max(...hits.map((h) => h.confidence));
    return {
      email,
      provider: hits.map((h) => h.provider).join(", "),
      confidence: boostForAgreement(bestConfidence, hits.length),
      verificationStatus: hits.find((h) => h.verificationStatus)?.verificationStatus,
    };
  });
  const phones = [...phoneMap.entries()].map(([phone, hits]) => ({
    phone,
    provider: hits.map((h) => h.provider).join(", "),
    confidence: boostForAgreement(Math.max(...hits.map((h) => h.confidence)), hits.length),
  }));

  const overallConfidence = emails.length || phones.length
    ? Math.max(...emails.map((e) => e.confidence), ...phones.map((p) => p.confidence), 0)
    : 0;

  const [candidate] = await db
    .insert(enrichmentCandidates)
    .values({
      firstName: firstName ?? input.firstName,
      lastName: lastName ?? input.lastName,
      jobTitle: input.jobTitle,
      companyName: input.companyName,
      companyDomain: input.companyDomain,
      linkedinUrl: input.linkedinUrl,
      emails,
      phones,
      confidence: overallConfidence,
      providerSources: sources,
      searchQuery: input as Record<string, string>,
      status: "PENDING",
    })
    .returning();

  return candidate;
}
