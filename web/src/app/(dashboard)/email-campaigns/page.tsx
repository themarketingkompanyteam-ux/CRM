"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Campaign = {
  id: number;
  name: string;
  status: string;
  instantlyCampaignId: string | null;
  createdAt: string;
  launchedAt: string | null;
  leadCount: number;
  sentCount: number;
  repliedCount: number;
  bouncedCount: number;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-950 text-green-400",
  paused: "bg-amber-950 text-amber-400",
  draft: "bg-secondary text-muted-foreground",
  completed: "bg-blue-950 text-blue-400",
  error: "bg-red-950 text-red-400",
};

const TABS = ["All", "active", "draft", "paused", "completed"];

export default function EmailCampaignsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("All");

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["email-campaigns"],
    queryFn: () => apiFetch<Campaign[]>("/api/email-campaigns"),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/email-campaigns/${id}/pause`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast.success("Campaign paused");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/email-campaigns/${id}/resume`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast.success("Campaign resumed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/email-campaigns/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast.success("Campaign deleted");
    },
  });

  const filtered = campaigns?.filter((c) => tab === "All" || c.status === tab) ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Instantly Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Requires sending accounts connected inside your Instantly workspace. Sending through your own
            Gmail/SMTP mailboxes instead? Use <Link href="/sequences" className="text-primary underline">Email Campaigns</Link>.
          </p>
        </div>
        <Link href="/email-campaigns/new">
          <Button className="bg-primary text-primary-foreground">+ Create Campaign</Button>
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs capitalize",
              tab === t ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-secondary/40 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Campaign</th>
                <th className="p-3">Status</th>
                <th className="p-3">Leads</th>
                <th className="p-3">Sent</th>
                <th className="p-3">Replies</th>
                <th className="p-3">Bounced</th>
                <th className="p-3">Created</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading...</td></tr>}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No campaigns yet.</td></tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="p-3 font-medium">
                    <Link href={`/email-campaigns/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="p-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_COLORS[c.status] ?? STATUS_COLORS.draft)}>
                      {c.status}
                    </span>
                  </td>
                  <td className="p-3">{c.leadCount}</td>
                  <td className="p-3">{c.sentCount}</td>
                  <td className="p-3">{c.repliedCount}</td>
                  <td className="p-3">{c.bouncedCount}</td>
                  <td className="p-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Link href={`/email-campaigns/${c.id}`} className="text-primary underline">
                        View
                      </Link>
                      {c.status === "active" && (
                        <button className="text-muted-foreground underline" onClick={() => pauseMutation.mutate(c.id)}>
                          Pause
                        </button>
                      )}
                      {c.status === "paused" && (
                        <button className="text-muted-foreground underline" onClick={() => resumeMutation.mutate(c.id)}>
                          Resume
                        </button>
                      )}
                      {c.status === "draft" && (
                        <button
                          className="text-red-400 underline"
                          onClick={() => {
                            if (confirm(`Delete draft campaign "${c.name}"?`)) deleteMutation.mutate(c.id);
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
