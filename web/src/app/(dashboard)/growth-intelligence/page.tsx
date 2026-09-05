"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

type QueueItem = {
  id: number;
  name: string;
  companyName: string | null;
  leadStatus: string;
  aiStatus: string;
  opportunityScore: number | null;
  primaryOpportunity: string | null;
  lastError: string | null;
  analyzedAt: string | null;
};

const TABS = [
  { key: "QUEUED", label: "Queued" },
  { key: "RESEARCHING", label: "Researching" },
  { key: "ANALYZING", label: "Analyzing" },
  { key: "NEEDS_REVIEW", label: "Needs Review" },
  { key: "COMPLETED", label: "Completed" },
  { key: "FAILED", label: "Failed" },
];

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-green-950 text-green-400",
  FAILED: "bg-red-950 text-red-400",
  NEEDS_REVIEW: "bg-amber-950 text-amber-400",
  QUEUED: "bg-secondary text-muted-foreground",
};

export default function GrowthIntelligencePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("COMPLETED");

  const { data: queue, isLoading } = useQuery({
    queryKey: ["gi-queue", tab],
    queryFn: () => apiFetch<QueueItem[]>(`/api/growth-intelligence/queue?status=${tab}`),
    refetchInterval: tab === "RESEARCHING" || tab === "ANALYZING" ? 4000 : false,
  });

  const analyzeHotMutation = useMutation({
    mutationFn: () => apiFetch<{ queued: number; deferredByDailyLimit: number }>("/api/growth-intelligence/analyze", { method: "POST", body: JSON.stringify({ mode: "hot" }) }),
    onSuccess: (data) => {
      toast.success(`Analyzing ${data.queued} hot lead(s)${data.deferredByDailyLimit ? `, ${data.deferredByDailyLimit} deferred by daily limit` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["gi-queue"] });
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Growth Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            AI research, opportunity detection, and sales briefs for your best leads
          </p>
        </div>
        <Button className="bg-primary text-primary-foreground" disabled={analyzeHotMutation.isPending} onClick={() => analyzeHotMutation.mutate()}>
          Analyze Hot Leads
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              tab === t.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-secondary/40 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Lead</th>
              <th className="p-3">Company</th>
              <th className="p-3">Score</th>
              <th className="p-3">Primary Opportunity</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && (queue?.length ?? 0) === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nothing here.</td></tr>
            )}
            {queue?.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-3 font-medium">{item.name}</td>
                <td className="p-3 text-muted-foreground">{item.companyName || "—"}</td>
                <td className="p-3">{item.opportunityScore ?? "—"}</td>
                <td className="p-3">{item.primaryOpportunity || "—"}</td>
                <td className="p-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_COLORS[item.aiStatus] ?? "bg-secondary text-muted-foreground")}>
                    {item.aiStatus}
                  </span>
                  {item.lastError && <div className="mt-1 max-w-xs truncate text-[11px] text-red-400">{item.lastError}</div>}
                </td>
                <td className="p-3">
                  <Link href={`/growth-intelligence/${item.id}`} className="text-primary underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
