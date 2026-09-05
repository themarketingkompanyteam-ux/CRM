"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Evidence = { finding: string; sourceUrl: string | null; observedDate: string | null; evidenceType: string; confidence: number };
type Opportunity = {
  id: number;
  category: string;
  title: string;
  description: string;
  severity: string;
  confidence: number;
  evidence: Evidence[];
  recommendedService: string;
  potentialImpact: string;
  reason: string;
};
type GiRecord = {
  contact: { id: number; name: string; aiStatus: string; aiOpportunityScore: number | null; aiLastError: string | null; aiAnalyzedAt: string | null };
  research: {
    companySummary: string;
    industry: string;
    services: string[];
    locations: string[];
    socialProfiles: string[];
    reviews: { text: string; source: string }[];
    recentSignals: string[];
    marketingSignals: string[];
    buyingSignals: { signal: string; source: string; date: string | null; confidence: number }[];
    sources: { url: string; title: string }[];
  } | null;
  opportunities: Opportunity[];
  score: {
    overallScore: number;
    fitScore: number;
    opportunityScore: number;
    buyingSignalScore: number;
    dataConfidenceScore: number;
    urgencyScore: number;
    scoreReason: string;
  } | null;
  salesBrief: {
    primaryOpportunity: string;
    secondaryOpportunity: string | null;
    buyingSignals: string[];
    likelyObjective: string;
    recommendedService: string;
    evidence: string[];
    riskFactors: string[];
    recommendedApproach: string;
  } | null;
  outreach: { id: number; type: string; subject: string | null; body: string }[];
  callScript: {
    opening: string;
    whyCalling: string;
    primaryProblem: string;
    evidence: string[];
    discoveryQuestions: string[];
    recommendedAngle: string;
    likelyObjections: { objection: string; response: string }[];
    nextStepRecommendation: string;
  } | null;
};

export default function GrowthIntelligenceDetailPage() {
  const params = useParams();
  const contactId = params.contactId as string;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["gi-detail", contactId],
    queryFn: () => apiFetch<GiRecord>(`/api/growth-intelligence/${contactId}`),
  });

  const reanalyzeMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/growth-intelligence/analyze", { method: "POST", body: JSON.stringify({ contactId: Number(contactId), forceRefresh: true }) }),
    onSuccess: () => {
      toast.success("Re-analysis queued");
      queryClient.invalidateQueries({ queryKey: ["gi-detail", contactId] });
    },
  });

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading...</div>;

  const { contact, research, opportunities, score, salesBrief, outreach, callScript } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{contact.name}</h1>
          <p className="text-sm text-muted-foreground">
            Growth Intelligence — {contact.aiStatus}
            {contact.aiOpportunityScore !== null && ` — Score ${contact.aiOpportunityScore}/100`}
          </p>
        </div>
        <Button variant="outline" disabled={reanalyzeMutation.isPending} onClick={() => reanalyzeMutation.mutate()}>
          Re-analyze
        </Button>
      </div>

      {contact.aiLastError && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-400">{contact.aiLastError}</div>
      )}

      {score && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Opportunity Score</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 text-3xl font-bold text-primary">{score.overallScore}/100</div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <div><div className="text-xs text-muted-foreground">Fit</div>{score.fitScore}</div>
              <div><div className="text-xs text-muted-foreground">Opportunity</div>{score.opportunityScore}</div>
              <div><div className="text-xs text-muted-foreground">Buying Signal</div>{score.buyingSignalScore}</div>
              <div><div className="text-xs text-muted-foreground">Data Confidence</div>{score.dataConfidenceScore}</div>
              <div><div className="text-xs text-muted-foreground">Urgency</div>{score.urgencyScore}</div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{score.scoreReason}</p>
          </CardContent>
        </Card>
      )}

      {research && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Company Research</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>{research.companySummary}</p>
            <div><span className="text-muted-foreground">Industry:</span> {research.industry}</div>
            {research.services?.length > 0 && (
              <div><span className="text-muted-foreground">Services:</span> {research.services.join(", ")}</div>
            )}
            {research.buyingSignals?.length > 0 && (
              <div>
                <div className="mb-1 font-semibold">Buying Signals</div>
                {research.buyingSignals.map((s, i) => (
                  <div key={i} className="mb-1 rounded-md bg-secondary/40 p-2">
                    <div>{s.signal}</div>
                    <div className="text-xs text-muted-foreground">Source: {s.source} · Confidence: {s.confidence}%{s.date ? ` · ${s.date}` : ""}</div>
                  </div>
                ))}
              </div>
            )}
            {research.sources?.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Sources: {research.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="mr-2 underline">{s.title}</a>)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {opportunities.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Opportunities & Evidence</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {opportunities.map((o) => (
              <div key={o.id} className="rounded-lg border p-3">
                <div className="mb-1 flex items-center justify-between">
                  <div className="font-semibold">{o.category}: {o.title}</div>
                  <span className="text-xs text-muted-foreground">{o.severity} · {o.confidence}%</span>
                </div>
                <p className="mb-2 text-sm text-muted-foreground">{o.description}</p>
                <div className="mb-2 text-xs"><span className="text-muted-foreground">Recommended:</span> {o.recommendedService}</div>
                {o.evidence?.length > 0 && (
                  <div className="space-y-1">
                    {o.evidence.map((e, i) => (
                      <div key={i} className="text-xs text-muted-foreground">
                        [{e.evidenceType}] {e.finding} {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="underline">source</a>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {salesBrief && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Sales Brief</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Primary opportunity:</span> {salesBrief.primaryOpportunity}</div>
            {salesBrief.secondaryOpportunity && <div><span className="text-muted-foreground">Secondary:</span> {salesBrief.secondaryOpportunity}</div>}
            <div><span className="text-muted-foreground">Likely objective:</span> {salesBrief.likelyObjective}</div>
            <div><span className="text-muted-foreground">Recommended service:</span> {salesBrief.recommendedService}</div>
            {salesBrief.riskFactors?.length > 0 && (
              <div><span className="text-muted-foreground">Risk factors:</span> {salesBrief.riskFactors.join("; ")}</div>
            )}
            <div className="rounded-md bg-secondary/40 p-2"><span className="text-muted-foreground">Approach:</span> {salesBrief.recommendedApproach}</div>
          </CardContent>
        </Card>
      )}

      {outreach.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Personalized Outreach</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {outreach.map((o) => (
              <div key={o.id} className="rounded-lg border p-3 text-sm">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{o.type.replace("_", " ")}</div>
                {o.subject && <div className="mb-1 font-medium">{o.subject}</div>}
                <p className="whitespace-pre-wrap text-muted-foreground">{o.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {callScript && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Call Script</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Opening:</span> {callScript.opening}</div>
            <div><span className="text-muted-foreground">Why calling:</span> {callScript.whyCalling}</div>
            <div><span className="text-muted-foreground">Primary problem:</span> {callScript.primaryProblem}</div>
            {callScript.discoveryQuestions?.length > 0 && (
              <div>
                <div className="text-muted-foreground">Discovery questions:</div>
                <ul className="ml-4 list-disc">{callScript.discoveryQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </div>
            )}
            {callScript.likelyObjections?.length > 0 && (
              <div>
                <div className="text-muted-foreground">Likely objections:</div>
                {callScript.likelyObjections.map((o, i) => (
                  <div key={i} className="ml-2 mb-1">
                    <span className="font-medium">{o.objection}</span> — {o.response}
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-md bg-secondary/40 p-2"><span className="text-muted-foreground">Next step:</span> {callScript.nextStepRecommendation}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
