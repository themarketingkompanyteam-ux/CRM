import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  contacts,
  companies,
  aiResearch,
  aiOpportunities,
  aiScores,
  aiSalesBriefs,
  aiOutreach,
  aiCallScripts,
} from "@/db/schema";
import { geminiProvider } from "./gemini";
import { logAiUsage } from "./usage";
import { getGrowthIntelligenceSettings, getIcpConfig } from "./settings";
import {
  PROMPT_VERSIONS,
  RESEARCH_SCHEMA,
  buildResearchPrompt,
  OPPORTUNITIES_SCHEMA,
  buildOpportunitiesPrompt,
  SCORING_SCHEMA,
  buildScoringPrompt,
  SALES_BRIEF_SCHEMA,
  buildSalesBriefPrompt,
  OUTREACH_SCHEMA,
  buildOutreachPrompt,
  CALL_SCRIPT_SCHEMA,
  buildCallScriptPrompt,
} from "./prompts";

type PipelineOptions = {
  forceRefresh?: boolean;
  generateSalesBrief?: boolean;
  generateOutreach?: boolean;
  generateCallScript?: boolean;
};

async function setStatus(contactId: number, status: string, extra: Record<string, unknown> = {}) {
  await db.update(contacts).set({ aiStatus: status, updatedAt: new Date(), ...extra }).where(eq(contacts.id, contactId));
}

export async function runGrowthIntelligencePipeline(contactId: number, options: PipelineOptions = {}) {
  const settings = await getGrowthIntelligenceSettings();
  const generateSalesBrief = options.generateSalesBrief ?? settings.autoGenerateSalesBrief;
  const generateOutreach = options.generateOutreach ?? settings.autoGenerateOutreach;
  const generateCallScript = options.generateCallScript ?? true;

  const [row] = await db
    .select({ contact: contacts, companyName: companies.name })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!row) throw new Error("Contact not found");
  const contact = row.contact;

  try {
    // 1. Research (cached — skip if fresh unless force-refresh requested)
    const [existingResearch] = await db.select().from(aiResearch).where(eq(aiResearch.contactId, contactId)).limit(1);
    const isFresh = existingResearch?.expiresAt && existingResearch.expiresAt > new Date();

    let research = existingResearch;
    if (!isFresh || options.forceRefresh) {
      await setStatus(contactId, "RESEARCHING");
      const { system, user } = buildResearchPrompt({
        companyName: row.companyName ?? undefined,
        companyDomain: contact.companyDomain ?? undefined,
        website: contact.website ?? undefined,
        location: contact.location ?? undefined,
        jobTitle: contact.jobTitle ?? undefined,
      });
      const result = await geminiProvider.generateStructured<{
        companySummary: string;
        industry: string;
        services: string[];
        locations: string[];
        socialProfiles?: string[];
        reviews?: { text: string; source: string }[];
        recentSignals?: string[];
        marketingSignals?: string[];
        buyingSignals: { signal: string; source: string; date?: string | null; confidence: number }[];
      }>({ systemPrompt: system, userPrompt: user, schema: RESEARCH_SCHEMA, useGrounding: true });

      await logAiUsage({
        contactId,
        operation: "research",
        model: geminiProvider.model,
        promptVersion: PROMPT_VERSIONS.research,
        status: result.ok ? "SUCCESS" : "FAILED",
        usage: result.usage,
        durationMs: result.durationMs,
        errorMessage: result.errorMessage,
      });

      if (!result.ok || !result.data) {
        await setStatus(contactId, "FAILED", { aiLastError: result.errorMessage ?? "Research failed" });
        return { success: false, stage: "research", error: result.errorMessage };
      }

      const expiresAt = new Date(Date.now() + settings.refreshDays * 24 * 3600 * 1000);
      [research] = await db
        .insert(aiResearch)
        .values({
          contactId,
          companySummary: result.data.companySummary,
          industry: result.data.industry,
          services: result.data.services,
          locations: result.data.locations,
          website: contact.website ?? undefined,
          socialProfiles: result.data.socialProfiles ?? [],
          reviews: result.data.reviews ?? [],
          recentSignals: result.data.recentSignals ?? [],
          marketingSignals: result.data.marketingSignals ?? [],
          buyingSignals: (result.data.buyingSignals ?? []).map((s) => ({
            signal: s.signal,
            source: s.source,
            date: s.date ?? null,
            confidence: s.confidence,
          })),
          sources: result.sources ?? [],
          promptVersion: PROMPT_VERSIONS.research,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: aiResearch.contactId,
          set: {
            companySummary: result.data.companySummary,
            industry: result.data.industry,
            services: result.data.services,
            locations: result.data.locations,
            socialProfiles: result.data.socialProfiles ?? [],
            reviews: result.data.reviews ?? [],
            recentSignals: result.data.recentSignals ?? [],
            marketingSignals: result.data.marketingSignals ?? [],
            buyingSignals: (result.data.buyingSignals ?? []).map((s) => ({
              signal: s.signal,
              source: s.source,
              date: s.date ?? null,
              confidence: s.confidence,
            })),
            sources: result.sources ?? [],
            promptVersion: PROMPT_VERSIONS.research,
            researchedAt: new Date(),
            expiresAt,
          },
        })
        .returning();
    }

    // 2. Opportunities
    await setStatus(contactId, "ANALYZING");
    const oppPrompt = buildOpportunitiesPrompt(research, research?.websiteAnalysis ?? null);
    const oppResult = await geminiProvider.generateStructured<{
      opportunities: Array<{
        category: string;
        title: string;
        description: string;
        severity: string;
        confidence: number;
        evidence?: Array<{ finding: string; sourceUrl?: string | null; observedDate?: string | null; evidenceType: string; confidence: number }>;
        recommendedService: string;
        potentialImpact?: string;
        reason: string;
      }>;
    }>({ systemPrompt: oppPrompt.system, userPrompt: oppPrompt.user, schema: OPPORTUNITIES_SCHEMA });

    await logAiUsage({
      contactId,
      operation: "opportunities",
      model: geminiProvider.model,
      promptVersion: PROMPT_VERSIONS.opportunities,
      status: oppResult.ok ? "SUCCESS" : "FAILED",
      usage: oppResult.usage,
      durationMs: oppResult.durationMs,
      errorMessage: oppResult.errorMessage,
    });

    if (!oppResult.ok || !oppResult.data) {
      await setStatus(contactId, "NEEDS_REVIEW", { aiLastError: oppResult.errorMessage ?? "Opportunity detection failed" });
      return { success: false, stage: "opportunities", error: oppResult.errorMessage };
    }

    await db.delete(aiOpportunities).where(eq(aiOpportunities.contactId, contactId));
    if (oppResult.data.opportunities.length > 0) {
      await db.insert(aiOpportunities).values(
        oppResult.data.opportunities.map((o) => ({
          contactId,
          category: o.category,
          title: o.title,
          description: o.description,
          severity: o.severity,
          confidence: o.confidence,
          evidence: (o.evidence ?? []).map((e) => ({
            finding: e.finding,
            sourceUrl: e.sourceUrl ?? null,
            observedDate: e.observedDate ?? null,
            evidenceType: e.evidenceType,
            confidence: e.confidence,
          })),
          recommendedService: o.recommendedService,
          potentialImpact: o.potentialImpact ?? "",
          reason: o.reason,
          promptVersion: PROMPT_VERSIONS.opportunities,
        }))
      );
    }

    await setStatus(contactId, "OPPORTUNITIES_FOUND");

    // 3. Scoring
    const icp = await getIcpConfig();
    const scorePrompt = buildScoringPrompt(research, oppResult.data.opportunities, icp);
    const scoreResult = await geminiProvider.generateStructured<{
      fitScore: number;
      opportunityScore: number;
      buyingSignalScore: number;
      dataConfidenceScore: number;
      urgencyScore: number;
      scoreReason: string;
    }>({ systemPrompt: scorePrompt.system, userPrompt: scorePrompt.user, schema: SCORING_SCHEMA });

    await logAiUsage({
      contactId,
      operation: "scoring",
      model: geminiProvider.model,
      promptVersion: PROMPT_VERSIONS.scoring,
      status: scoreResult.ok ? "SUCCESS" : "FAILED",
      usage: scoreResult.usage,
      durationMs: scoreResult.durationMs,
      errorMessage: scoreResult.errorMessage,
    });

    if (!scoreResult.ok || !scoreResult.data) {
      await setStatus(contactId, "NEEDS_REVIEW", { aiLastError: scoreResult.errorMessage ?? "Scoring failed" });
      return { success: false, stage: "scoring", error: scoreResult.errorMessage };
    }

    // Weighted overall score — configurable weights, defaulting per spec.
    const weights = { fit: 0.25, opportunity: 0.3, buyingSignal: 0.2, dataConfidence: 0.15, urgency: 0.1 };
    const overallScore = Math.round(
      scoreResult.data.fitScore * weights.fit +
        scoreResult.data.opportunityScore * weights.opportunity +
        scoreResult.data.buyingSignalScore * weights.buyingSignal +
        scoreResult.data.dataConfidenceScore * weights.dataConfidence +
        scoreResult.data.urgencyScore * weights.urgency
    );

    await db
      .insert(aiScores)
      .values({ contactId, overallScore, ...scoreResult.data })
      .onConflictDoUpdate({
        target: aiScores.contactId,
        set: { overallScore, ...scoreResult.data, scoredAt: new Date() },
      });

    const primaryOpp = oppResult.data.opportunities[0];
    await setStatus(contactId, "SCORED", {
      aiOpportunityScore: overallScore,
      aiPrimaryOpportunity: primaryOpp?.title ?? null,
      aiRecommendedService: primaryOpp?.recommendedService ?? null,
      aiAnalyzedAt: new Date(),
    });

    // 4. Sales brief (only if score meets threshold, or explicitly requested)
    let salesBrief = null;
    if (generateSalesBrief && (overallScore >= settings.minOpportunityScore || options.generateSalesBrief)) {
      const briefPrompt = buildSalesBriefPrompt(research, oppResult.data.opportunities, scoreResult.data);
      const briefResult = await geminiProvider.generateStructured<{
        primaryOpportunity: string;
        secondaryOpportunity?: string;
        buyingSignals?: string[];
        likelyObjective?: string;
        recommendedService: string;
        evidence?: string[];
        riskFactors?: string[];
        recommendedApproach: string;
      }>({ systemPrompt: briefPrompt.system, userPrompt: briefPrompt.user, schema: SALES_BRIEF_SCHEMA });

      await logAiUsage({
        contactId,
        operation: "sales_brief",
        model: geminiProvider.model,
        promptVersion: PROMPT_VERSIONS.salesBrief,
        status: briefResult.ok ? "SUCCESS" : "FAILED",
        usage: briefResult.usage,
        durationMs: briefResult.durationMs,
        errorMessage: briefResult.errorMessage,
      });

      if (briefResult.ok && briefResult.data) {
        [salesBrief] = await db
          .insert(aiSalesBriefs)
          .values({
            contactId,
            primaryOpportunity: briefResult.data.primaryOpportunity,
            secondaryOpportunity: briefResult.data.secondaryOpportunity ?? null,
            buyingSignals: briefResult.data.buyingSignals ?? [],
            likelyObjective: briefResult.data.likelyObjective ?? "",
            recommendedService: briefResult.data.recommendedService,
            evidence: briefResult.data.evidence ?? [],
            riskFactors: briefResult.data.riskFactors ?? [],
            recommendedApproach: briefResult.data.recommendedApproach,
            promptVersion: PROMPT_VERSIONS.salesBrief,
          })
          .onConflictDoUpdate({
            target: aiSalesBriefs.contactId,
            set: {
              primaryOpportunity: briefResult.data.primaryOpportunity,
              secondaryOpportunity: briefResult.data.secondaryOpportunity ?? null,
              buyingSignals: briefResult.data.buyingSignals ?? [],
              likelyObjective: briefResult.data.likelyObjective ?? "",
              recommendedService: briefResult.data.recommendedService,
              evidence: briefResult.data.evidence ?? [],
              riskFactors: briefResult.data.riskFactors ?? [],
              recommendedApproach: briefResult.data.recommendedApproach,
              promptVersion: PROMPT_VERSIONS.salesBrief,
              createdAt: new Date(),
            },
          })
          .returning();
        await setStatus(contactId, "SALES_READY");
      }
    }

    // 5. Outreach
    if (generateOutreach && salesBrief) {
      const contactName = `${contact.firstName} ${contact.lastName ?? ""}`.trim();
      const outreachPrompt = buildOutreachPrompt(contactName, research, salesBrief);
      const outreachResult = await geminiProvider.generateStructured<{
        coldEmail: { subject: string; body: string };
        followUpEmail?: { subject: string; body: string };
        linkedin?: string;
        sms?: string;
        whatsapp?: string;
      }>({ systemPrompt: outreachPrompt.system, userPrompt: outreachPrompt.user, schema: OUTREACH_SCHEMA });

      await logAiUsage({
        contactId,
        operation: "outreach",
        model: geminiProvider.model,
        promptVersion: PROMPT_VERSIONS.outreach,
        status: outreachResult.ok ? "SUCCESS" : "FAILED",
        usage: outreachResult.usage,
        durationMs: outreachResult.durationMs,
        errorMessage: outreachResult.errorMessage,
      });

      if (outreachResult.ok && outreachResult.data) {
        await db.delete(aiOutreach).where(eq(aiOutreach.contactId, contactId));
        const rows = [
          { type: "cold_email", subject: outreachResult.data.coldEmail.subject, body: outreachResult.data.coldEmail.body },
          ...(outreachResult.data.followUpEmail
            ? [{ type: "followup_email", subject: outreachResult.data.followUpEmail.subject, body: outreachResult.data.followUpEmail.body }]
            : []),
          ...(outreachResult.data.linkedin ? [{ type: "linkedin", subject: null, body: outreachResult.data.linkedin }] : []),
          ...(outreachResult.data.sms ? [{ type: "sms", subject: null, body: outreachResult.data.sms }] : []),
          ...(outreachResult.data.whatsapp ? [{ type: "whatsapp", subject: null, body: outreachResult.data.whatsapp }] : []),
        ];
        await db.insert(aiOutreach).values(
          rows.map((r) => ({ contactId, promptVersion: PROMPT_VERSIONS.outreach, ...r }))
        );
      }
    }

    // 6. Call script
    if (generateCallScript && salesBrief) {
      const contactName = `${contact.firstName} ${contact.lastName ?? ""}`.trim();
      const scriptPrompt = buildCallScriptPrompt(contactName, research, salesBrief);
      const scriptResult = await geminiProvider.generateStructured<{
        opening: string;
        whyCalling: string;
        primaryProblem: string;
        evidence?: string[];
        discoveryQuestions: string[];
        recommendedAngle?: string;
        likelyObjections?: { objection: string; response: string }[];
        nextStepRecommendation: string;
      }>({ systemPrompt: scriptPrompt.system, userPrompt: scriptPrompt.user, schema: CALL_SCRIPT_SCHEMA });

      await logAiUsage({
        contactId,
        operation: "call_script",
        model: geminiProvider.model,
        promptVersion: PROMPT_VERSIONS.callScript,
        status: scriptResult.ok ? "SUCCESS" : "FAILED",
        usage: scriptResult.usage,
        durationMs: scriptResult.durationMs,
        errorMessage: scriptResult.errorMessage,
      });

      if (scriptResult.ok && scriptResult.data) {
        await db
          .insert(aiCallScripts)
          .values({
            contactId,
            opening: scriptResult.data.opening,
            whyCalling: scriptResult.data.whyCalling,
            primaryProblem: scriptResult.data.primaryProblem,
            evidence: scriptResult.data.evidence ?? [],
            discoveryQuestions: scriptResult.data.discoveryQuestions,
            recommendedAngle: scriptResult.data.recommendedAngle ?? "",
            likelyObjections: scriptResult.data.likelyObjections ?? [],
            nextStepRecommendation: scriptResult.data.nextStepRecommendation,
            promptVersion: PROMPT_VERSIONS.callScript,
          })
          .onConflictDoUpdate({
            target: aiCallScripts.contactId,
            set: {
              opening: scriptResult.data.opening,
              whyCalling: scriptResult.data.whyCalling,
              primaryProblem: scriptResult.data.primaryProblem,
              evidence: scriptResult.data.evidence ?? [],
              discoveryQuestions: scriptResult.data.discoveryQuestions,
              recommendedAngle: scriptResult.data.recommendedAngle ?? "",
              likelyObjections: scriptResult.data.likelyObjections ?? [],
              nextStepRecommendation: scriptResult.data.nextStepRecommendation,
              promptVersion: PROMPT_VERSIONS.callScript,
              createdAt: new Date(),
            },
          });
      }
    }

    const pushToProspecting = overallScore >= settings.minOpportunityScore && settings.autoPushToProspecting;
    await setStatus(contactId, "COMPLETED", {
      aiPushedToProspecting: pushToProspecting ? 1 : 0,
      aiLastError: null,
    });

    return { success: true, overallScore };
  } catch (err) {
    await setStatus(contactId, "FAILED", { aiLastError: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
