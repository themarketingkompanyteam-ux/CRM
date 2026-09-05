"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CallDialog, CallLead } from "@/components/call-dialog";
import { toast } from "sonner";
import Link from "next/link";

type Lead = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  linkedinUrl: string | null;
  companyName: string | null;
  leadStatus: string;
  nextFollowUpAt: string | null;
  lastOutcome: string | null;
  lastNotes: string | null;
  lastCallAt: string | null;
  enrichmentStatus: string;
  enrichmentConfidence: number | null;
  enrichmentProvider: string | null;
  extraEmails: { email: string; provider: string | null }[];
  extraPhones: { phone: string; provider: string | null }[];
  aiStatus?: string;
  aiOpportunityScore?: number | null;
};

type Stats = { hot: number; warm: number; toCall: number; callBack: number; booked: number };
type AvailableCounts = { hot: number; warm: number; cold: number; total: number };

const BUCKETS = [
  { key: "Hot", label: "🔥 Hot Leads" },
  { key: "Warm", label: "🟠 Warm Leads" },
  { key: "CallBack", label: "↩ Call Backs" },
];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const [bucket, setBucket] = useState("Hot");
  const [activeLead, setActiveLead] = useState<CallLead | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", bucket],
    queryFn: () => apiFetch<Lead[]>(`/api/leads?bucket=${bucket}`),
  });

  const { data: hotLeads } = useQuery({
    queryKey: ["leads", "Hot"],
    queryFn: () => apiFetch<Lead[]>("/api/leads?bucket=Hot"),
  });
  const { data: warmLeads } = useQuery({
    queryKey: ["leads", "Warm"],
    queryFn: () => apiFetch<Lead[]>("/api/leads?bucket=Warm"),
  });
  const { data: callBackLeads } = useQuery({
    queryKey: ["leads", "CallBack"],
    queryFn: () => apiFetch<Lead[]>("/api/leads?bucket=CallBack"),
  });

  const counts: Record<string, number | undefined> = {
    Hot: hotLeads?.length,
    Warm: warmLeads?.length,
    CallBack: callBackLeads?.length,
  };

  const [enrichingId, setEnrichingId] = useState<number | null>(null);

  type EnrichApiResult = {
    success: boolean;
    results: { operation: string; success: boolean; providerUsed?: string; outcome: string }[];
  };

  const enrichOneMutation = useMutation({
    mutationFn: (contactId: number) =>
      apiFetch<EnrichApiResult>("/api/enrichment/enrich", { method: "POST", body: JSON.stringify({ contactId }) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      const found = data.results.filter((r) => r.success);
      if (found.length > 0) {
        toast.success(
          found.map((r) => `${r.operation === "search_email" ? "Email" : "Phone"} found via ${r.providerUsed}`).join(" · ")
        );
      } else {
        toast.error("No provider found new information for this lead");
      }
    },
    onSettled: () => setEnrichingId(null),
  });

  const pushToQueueMutation = useMutation({
    mutationFn: (contactIds: number[]) =>
      apiFetch<{ count: number }>("/api/enrichment/queue", { method: "POST", body: JSON.stringify({ contactIds, source: "manual" }) }),
    onSuccess: (data) => {
      toast.success(`Pushed ${data.count} lead(s) to Enrichment queue`);
      setSelected(new Set());
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: (contactIds: number[]) =>
      apiFetch<{ queued: number; deferredByDailyLimit: number }>("/api/growth-intelligence/analyze", {
        method: "POST",
        body: JSON.stringify({ contactIds }),
      }),
    onSuccess: (data) => {
      toast.success(`Analyzing ${data.queued} lead(s) with AI${data.deferredByDailyLimit ? ` (${data.deferredByDailyLimit} deferred by daily limit)` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setSelected(new Set());
    },
  });

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Everyone marked Hot, Warm, or due for a callback — from Prospecting calls
          </p>
        </div>
        <EnrichAvailableLeadsDialog />
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border bg-secondary/40 px-4 py-2 text-sm">
          <span>{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => pushToQueueMutation.mutate([...selected])}>
            Push to Enrichment
          </Button>
          <Button size="sm" variant="outline" onClick={() => analyzeMutation.mutate([...selected])}>
            Analyze Selected with AI
          </Button>
        </div>
      )}

      <Tabs value={bucket} onValueChange={setBucket}>
        <TabsList className="mb-5">
          {BUCKETS.map((b) => (
            <TabsTrigger key={b.key} value={b.key}>
              {b.label} {counts[b.key] !== undefined ? `(${counts[b.key]})` : ""}
            </TabsTrigger>
          ))}
        </TabsList>

        {BUCKETS.map((b) => (
          <TabsContent key={b.key} value={b.key}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
              {!isLoading && (leads?.length ?? 0) === 0 && (
                <div className="text-sm text-muted-foreground">Nothing here yet.</div>
              )}
              {leads?.map((lead) => (
                <div key={lead.id} className="rounded-xl border bg-card p-4">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} />
                      <span className="font-semibold">{lead.name}</span>
                    </label>
                    <LeadBadge status={lead.leadStatus} />
                  </div>
                  <div className="mb-1 text-sm text-muted-foreground">{lead.companyName || "—"}</div>
                  <div className="mb-2 text-sm">{lead.phone}</div>
                  {lead.email && <div className="mb-1 text-xs text-muted-foreground">{lead.email}</div>}
                  {lead.linkedinUrl && (
                    <a
                      href={lead.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-1 block text-xs text-primary underline"
                    >
                      LinkedIn ↗
                    </a>
                  )}
                  {(lead.extraEmails.length > 0 || lead.extraPhones.length > 0) && (
                    <div className="mb-2 space-y-0.5 rounded-md bg-secondary/40 p-2">
                      <div className="text-[11px] font-semibold uppercase text-muted-foreground">Also found</div>
                      {lead.extraEmails.map((e) => (
                        <div key={e.email} className="text-xs">
                          {e.email} <span className="text-muted-foreground">({e.provider})</span>
                        </div>
                      ))}
                      {lead.extraPhones.map((p) => (
                        <div key={p.phone} className="text-xs">
                          {p.phone} <span className="text-muted-foreground">({p.provider})</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {lead.enrichmentStatus === "ENRICHED" && lead.enrichmentConfidence !== null && (
                    <div className="mb-2 text-[11px] text-primary">
                      Enriched via {lead.enrichmentProvider} · {lead.enrichmentConfidence}% confidence
                    </div>
                  )}
                  {lead.aiStatus && lead.aiStatus !== "NOT_ANALYZED" && (
                    <div className="mb-2 text-[11px]">
                      {lead.aiStatus === "COMPLETED" ? (
                        <Link href={`/growth-intelligence/${lead.id}`} className="text-primary underline">
                          🧠 AI Score {lead.aiOpportunityScore}/100 — View Analysis
                        </Link>
                      ) : lead.aiStatus === "FAILED" ? (
                        <span className="text-red-400">🧠 AI analysis failed</span>
                      ) : (
                        <span className="text-muted-foreground">🧠 AI: {lead.aiStatus}</span>
                      )}
                    </div>
                  )}
                  {lead.lastOutcome && (
                    <div className="mb-1 text-xs text-primary">Last outcome: {lead.lastOutcome}</div>
                  )}
                  {lead.lastNotes && (
                    <div className="mb-2 text-xs italic text-muted-foreground">
                      &quot;{lead.lastNotes}&quot;
                    </div>
                  )}
                  {lead.nextFollowUpAt && (
                    <div className="text-xs text-amber-400">
                      Follow up: {fmtDate(lead.nextFollowUpAt)}
                    </div>
                  )}
                  {lead.lastCallAt && (
                    <div className="mb-3 text-xs text-muted-foreground">
                      Last called: {fmtDate(lead.lastCallAt)}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-primary text-primary-foreground"
                      disabled={!lead.phone}
                      onClick={() =>
                        setActiveLead({
                          id: lead.id,
                          firstName: lead.name,
                          lastName: null,
                          phone: lead.phone,
                          companyName: lead.companyName,
                        })
                      }
                    >
                      📞 {lead.phone ? "Call" : "No phone"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={enrichingId === lead.id}
                      onClick={() => {
                        setEnrichingId(lead.id);
                        enrichOneMutation.mutate(lead.id);
                      }}
                      title="Find email, phone, and LinkedIn via enrichment providers"
                    >
                      {enrichingId === lead.id ? "Enriching..." : "Enrich"}
                    </Button>
                    {bucket === "Hot" && (!lead.aiStatus || lead.aiStatus === "NOT_ANALYZED" || lead.aiStatus === "FAILED") && (
                      <Button
                        variant="outline"
                        disabled={analyzeMutation.isPending}
                        onClick={() => analyzeMutation.mutate([lead.id])}
                        title="Run Gemini research, opportunity detection, scoring, and sales brief"
                      >
                        🧠 Analyze
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <CallDialog lead={activeLead} onClose={() => setActiveLead(null)} />
    </div>
  );
}

function EnrichAvailableLeadsDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("hot");

  const { data: available } = useQuery({
    queryKey: ["leads-available"],
    queryFn: () => apiFetch<AvailableCounts>("/api/leads/available"),
    enabled: open,
  });

  const queueMutation = useMutation({
    mutationFn: () => apiFetch<{ count: number }>("/api/enrichment/enrich-bulk", { method: "POST", body: JSON.stringify({ mode }) }),
    onSuccess: (data) => {
      toast.success(`Queued ${data.count} lead(s) for enrichment. Go to Enrichment → Enrich Queued Contacts to run them.`);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["enrichment-queue"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="bg-primary text-primary-foreground">+ Enrich Available Leads</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enrich Available Leads</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">You currently have:</p>
          <ul className="space-y-1">
            <li>{available?.total ?? "…"} leads available to enrich</li>
            <li>🔥 {available?.hot ?? "…"} Hot leads</li>
            <li>🟠 {available?.warm ?? "…"} Warm leads</li>
            <li>❄️ {available?.cold ?? "…"} Cold leads</li>
          </ul>
          <div>
            <p className="mb-2 text-muted-foreground">Choose what to enrich:</p>
            <div className="space-y-2">
              {[
                { key: "hot", label: `Hot leads only (${available?.hot ?? "…"})` },
                { key: "hot_warm", label: `Hot + Warm (${(available?.hot ?? 0) + (available?.warm ?? 0)})` },
                { key: "all", label: `All available leads (${available?.total ?? "…"})` },
              ].map((opt) => (
                <label key={opt.key} className="flex items-center gap-2">
                  <input type="radio" name="mode" checked={mode === opt.key} onChange={() => setMode(opt.key)} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            This only queues leads — no enrichment credits are spent until you click &quot;Enrich Queued Contacts&quot;
            on the Enrichment page.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground" disabled={queueMutation.isPending} onClick={() => queueMutation.mutate()}>
              Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeadBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Hot: "bg-red-950 text-red-400",
    Warm: "bg-amber-950 text-amber-400",
    Cold: "bg-secondary text-muted-foreground",
    Customer: "bg-green-950 text-green-400",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", map[status] ?? map.Cold)}>
      {status}
    </span>
  );
}
