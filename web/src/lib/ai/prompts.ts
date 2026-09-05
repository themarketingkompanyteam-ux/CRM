/**
 * Every prompt is versioned so ai_research/ai_opportunities/etc rows can
 * record exactly which prompt produced them (schema evolves independently
 * per stage).
 */
export const PROMPT_VERSIONS = {
  research: "1.0",
  opportunities: "1.0",
  scoring: "1.0",
  salesBrief: "1.0",
  outreach: "1.0",
  callScript: "1.0",
  emailSequence: "1.0",
} as const;

const NO_FABRICATION_RULE = `
Rules you must follow:
- Only state things you can support from the provided information or from search results.
- Never invent emails, phone numbers, people, job titles, revenue, review counts, traffic, ad spend, or business events.
- If something is unknown, use "UNKNOWN" or "NOT FOUND" rather than guessing.
- Distinguish OBSERVED FACT from INFERENCE. Do not present an inference as a fact.
- Every claim used as evidence should be traceable to a source you found or to the input data.
`.trim();

export const RESEARCH_SCHEMA = {
  type: "OBJECT",
  properties: {
    companySummary: { type: "STRING" },
    industry: { type: "STRING" },
    services: { type: "ARRAY", items: { type: "STRING" } },
    locations: { type: "ARRAY", items: { type: "STRING" } },
    website: { type: "STRING" },
    socialProfiles: { type: "ARRAY", items: { type: "STRING" } },
    reviews: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { text: { type: "STRING" }, source: { type: "STRING" } },
        required: ["text", "source"],
      },
    },
    recentSignals: { type: "ARRAY", items: { type: "STRING" } },
    marketingSignals: { type: "ARRAY", items: { type: "STRING" } },
    buyingSignals: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          signal: { type: "STRING" },
          source: { type: "STRING" },
          date: { type: "STRING", nullable: true },
          confidence: { type: "INTEGER" },
        },
        required: ["signal", "source", "confidence"],
      },
    },
  },
  required: ["companySummary", "industry", "services", "locations", "buyingSignals"],
};

export function buildResearchPrompt(input: {
  companyName?: string;
  companyDomain?: string;
  website?: string;
  industry?: string;
  location?: string;
  jobTitle?: string;
}) {
  const system = `You are a B2B research analyst for a marketing agency. You research a company using only publicly available information (web search) and produce structured, evidence-based findings.
${NO_FABRICATION_RULE}
If you cannot find a company matching the given details with reasonable confidence, say so explicitly in companySummary rather than guessing.`;

  const user = `Research this company:
Company name: ${input.companyName || "UNKNOWN"}
Website/domain: ${input.website || input.companyDomain || "UNKNOWN"}
Known industry: ${input.industry || "UNKNOWN"}
Known location: ${input.location || "UNKNOWN"}
Contact's job title: ${input.jobTitle || "UNKNOWN"}

Find and summarize: what the company does, its industry, services, locations, social profiles, any public reviews, recent public developments (recentSignals), observable marketing activity (marketingSignals e.g. active ads, blog, social posting), and concrete buying signals (e.g. expansion, hiring, new leadership, website redesign, marketing investment, weak conversion path). For each buying signal, name the source and your confidence (0-100).`;

  return { system, user };
}

export const OPPORTUNITIES_SCHEMA = {
  type: "OBJECT",
  properties: {
    opportunities: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING" },
          title: { type: "STRING" },
          description: { type: "STRING" },
          severity: { type: "STRING" },
          confidence: { type: "INTEGER" },
          evidence: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                finding: { type: "STRING" },
                sourceUrl: { type: "STRING", nullable: true },
                observedDate: { type: "STRING", nullable: true },
                evidenceType: { type: "STRING" },
                confidence: { type: "INTEGER" },
              },
              required: ["finding", "evidenceType", "confidence"],
            },
          },
          recommendedService: { type: "STRING" },
          potentialImpact: { type: "STRING" },
          reason: { type: "STRING" },
        },
        required: ["category", "title", "description", "severity", "confidence", "recommendedService", "reason"],
      },
    },
  },
  required: ["opportunities"],
};

const OPPORTUNITY_CATEGORIES = [
  "SEO", "Local SEO", "Website", "Conversion Optimization", "Paid Ads", "Social Media",
  "Content Marketing", "Email Marketing", "Branding", "Reputation", "Lead Generation",
  "Marketing Automation", "Landing Pages", "Creative", "Video",
];

export function buildOpportunitiesPrompt(research: unknown, websiteAnalysis: unknown) {
  const system = `You are a marketing opportunity analyst for a marketing agency selling services to small/medium businesses. Given research about a company, identify concrete, sellable marketing opportunities.
Allowed categories: ${OPPORTUNITY_CATEGORIES.join(", ")}.
${NO_FABRICATION_RULE}
Every opportunity's evidence must reference something actually present in the research data provided — do not invent findings not supported by it.`;

  const user = `Company research:
${JSON.stringify(research)}

Website analysis (if available):
${JSON.stringify(websiteAnalysis ?? "NOT AVAILABLE")}

Identify 2-6 concrete marketing opportunities this agency could pitch, each grounded in the evidence above. For each: category, a short title, description, severity (LOW/MEDIUM/HIGH), confidence 0-100, evidence array (each item tied to something in the research), recommendedService, potentialImpact (qualitative, no invented numbers), and reason this matters to the business.`;

  return { system, user };
}

export const SCORING_SCHEMA = {
  type: "OBJECT",
  properties: {
    fitScore: { type: "INTEGER" },
    opportunityScore: { type: "INTEGER" },
    buyingSignalScore: { type: "INTEGER" },
    dataConfidenceScore: { type: "INTEGER" },
    urgencyScore: { type: "INTEGER" },
    scoreReason: { type: "STRING" },
  },
  required: ["fitScore", "opportunityScore", "buyingSignalScore", "dataConfidenceScore", "urgencyScore", "scoreReason"],
};

export function buildScoringPrompt(research: unknown, opportunities: unknown, icp: unknown) {
  const system = `You are a lead qualification analyst. Score this lead across five 0-100 dimensions based only on the provided research, opportunities, and the agency's Ideal Customer Profile (ICP).
${NO_FABRICATION_RULE}`;

  const user = `Ideal Customer Profile (agency config):
${JSON.stringify(icp)}

Company research:
${JSON.stringify(research)}

Detected opportunities:
${JSON.stringify(opportunities)}

Score 0-100 for each:
- fitScore: how well this company matches the ICP
- opportunityScore: how significant/numerous the marketing opportunities are
- buyingSignalScore: strength of buying signals found
- dataConfidenceScore: how confident/complete the underlying research is (low if data is sparse or uncertain)
- urgencyScore: how time-sensitive acting on this lead appears to be
Explain your reasoning briefly in scoreReason.`;

  return { system, user };
}

export const SALES_BRIEF_SCHEMA = {
  type: "OBJECT",
  properties: {
    primaryOpportunity: { type: "STRING" },
    secondaryOpportunity: { type: "STRING", nullable: true },
    buyingSignals: { type: "ARRAY", items: { type: "STRING" } },
    likelyObjective: { type: "STRING" },
    recommendedService: { type: "STRING" },
    evidence: { type: "ARRAY", items: { type: "STRING" } },
    riskFactors: { type: "ARRAY", items: { type: "STRING" } },
    recommendedApproach: { type: "STRING" },
  },
  required: ["primaryOpportunity", "recommendedService", "recommendedApproach"],
};

export function buildSalesBriefPrompt(research: unknown, opportunities: unknown, score: unknown) {
  const system = `You write concise internal sales briefs for account executives at a marketing agency, based strictly on the research and opportunities already gathered.
${NO_FABRICATION_RULE}`;
  const user = `Research: ${JSON.stringify(research)}
Opportunities: ${JSON.stringify(opportunities)}
Score: ${JSON.stringify(score)}

Write a sales brief: why this lead matters, primary/secondary opportunity, the buying signals, the business's likely objective, recommended service, supporting evidence, risk factors (e.g. "already has an agency" if evidence suggests it, budget uncertainty, etc — only if evidence-based), and a recommended approach for the first conversation.`;
  return { system, user };
}

export const OUTREACH_SCHEMA = {
  type: "OBJECT",
  properties: {
    coldEmail: { type: "OBJECT", properties: { subject: { type: "STRING" }, body: { type: "STRING" } }, required: ["subject", "body"] },
    followUpEmail: { type: "OBJECT", properties: { subject: { type: "STRING" }, body: { type: "STRING" } }, required: ["subject", "body"] },
    linkedin: { type: "STRING" },
    sms: { type: "STRING" },
    whatsapp: { type: "STRING" },
  },
  required: ["coldEmail"],
};

export function buildOutreachPrompt(contactName: string, research: unknown, salesBrief: unknown) {
  const system = `You write personalized, evidence-based outbound outreach for a marketing agency's sales team. Personalization must be based only on facts actually known from the research/brief provided.
Never claim familiarity that doesn't exist (e.g. "you've been following us"). Never fabricate recent events, statistics, or reviews. Keep tone professional, concise, not pushy.
${NO_FABRICATION_RULE}`;
  const user = `Contact name: ${contactName}
Research: ${JSON.stringify(research)}
Sales brief: ${JSON.stringify(salesBrief)}

Write: a cold email (subject+body), a follow-up email (subject+body) assuming no response to the first, a short LinkedIn connection/message, a short SMS, and a short WhatsApp message. All grounded in the evidence above — reference the specific opportunity/observation, not generic claims.`;
  return { system, user };
}

export const EMAIL_SEQUENCE_SCHEMA = {
  type: "OBJECT",
  properties: {
    subjectLines: { type: "ARRAY", items: { type: "STRING" } },
    initialEmail: { type: "STRING" },
    followUp1: { type: "STRING" },
    followUp2: { type: "STRING" },
  },
  required: ["subjectLines", "initialEmail", "followUp1", "followUp2"],
};

/**
 * Campaign-level sequence generation. Unlike buildOutreachPrompt (single ad-hoc
 * message for a specific contact record), this generates a template sequence with
 * {{variables}} for personalization across many leads, used by /email-campaigns.
 */
export function buildEmailSequencePrompt(input: {
  audienceDescription: string;
  research?: unknown;
  opportunities?: unknown;
  salesBrief?: unknown;
}) {
  const hasGrowthIntelligenceData = !!(input.research || input.opportunities || input.salesBrief);
  const system = `You write cold email outreach sequences for a marketing agency's sales team, to be sent to many leads using personalization variables like {{firstName}}, {{lastName}}, {{companyName}}, {{jobTitle}}, {{website}}.
${
  hasGrowthIntelligenceData
    ? "You are also given real research/opportunity/sales-brief data for a representative example lead in this audience — use it only to decide what KIND of angle and observation to reference in the template (e.g. \"I noticed {{companyName}}'s website...\"), never insert facts specific to that one example lead as if they applied to every recipient."
    : "No lead-specific research is available for this audience — write a generic but professional, non-pushy cold outreach template using only the personalization variables listed above."
}
Never claim familiarity that doesn't exist (e.g. "we've spoken before", "you downloaded our guide") unless a variable explicitly represents that fact. Never fabricate statistics, review counts, or specific business events.
${NO_FABRICATION_RULE}`;
  const user = `Audience: ${input.audienceDescription}
${input.research ? `Representative research example: ${JSON.stringify(input.research)}` : ""}
${input.opportunities ? `Representative opportunities example: ${JSON.stringify(input.opportunities)}` : ""}
${input.salesBrief ? `Representative sales brief example: ${JSON.stringify(input.salesBrief)}` : ""}

Generate: 3 subject line options (as subjectLines), an initial cold email body (initialEmail), a follow-up #1 body sent a few days later assuming no reply (followUp1), and a final follow-up #2 body (followUp2). Use {{firstName}}, {{companyName}}, etc. for personalization. Keep each email under 120 words, plain text (no markdown), professional and concise.`;
  return { system, user };
}

export const CALL_SCRIPT_SCHEMA = {
  type: "OBJECT",
  properties: {
    opening: { type: "STRING" },
    whyCalling: { type: "STRING" },
    primaryProblem: { type: "STRING" },
    evidence: { type: "ARRAY", items: { type: "STRING" } },
    discoveryQuestions: { type: "ARRAY", items: { type: "STRING" } },
    recommendedAngle: { type: "STRING" },
    likelyObjections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { objection: { type: "STRING" }, response: { type: "STRING" } },
        required: ["objection", "response"],
      },
    },
    nextStepRecommendation: { type: "STRING" },
  },
  required: ["opening", "whyCalling", "primaryProblem", "discoveryQuestions", "nextStepRecommendation"],
};

export function buildCallScriptPrompt(contactName: string, research: unknown, salesBrief: unknown) {
  const system = `You write sales call briefs/scripts for an agency's sales team, grounded strictly in the research and sales brief provided. Avoid manipulative or deceptive claims.
${NO_FABRICATION_RULE}`;
  const user = `Contact: ${contactName}
Research: ${JSON.stringify(research)}
Sales brief: ${JSON.stringify(salesBrief)}

Produce a call script: opening line, why you're calling, the primary problem to raise, supporting evidence, discovery questions, recommended angle, likely objections with suggested responses, and a next-step recommendation.`;
  return { system, user };
}
