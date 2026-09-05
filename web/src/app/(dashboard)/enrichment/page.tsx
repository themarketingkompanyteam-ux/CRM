"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type QueueItem = {
  id: number;
  contactId: number;
  status: string;
  source: string | null;
  lastProvider: string | null;
  lastError: string | null;
  name: string;
  companyName: string | null;
  companyDomain: string | null;
  linkedinUrl: string | null;
  email: string | null;
  phone: string | null;
  leadStatus: string;
  createdAt: string;
};

type Candidate = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  companyName: string | null;
  companyDomain: string | null;
  linkedinUrl: string | null;
  emails: { email: string; provider: string; confidence: number; verificationStatus?: string }[];
  phones: { phone: string; provider: string; confidence: number }[];
  confidence: number | null;
  providerSources: string[];
};

const TABS = [
  { key: "QUEUED", label: "Queued" },
  { key: "PROCESSING", label: "Processing" },
  { key: "ENRICHED", label: "Enriched" },
  { key: "NEEDS_REVIEW", label: "Needs Review" },
  { key: "FAILED", label: "Failed" },
];

function confidenceLabel(score: number) {
  if (score >= 90) return "Very High";
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

export default function EnrichmentPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("QUEUED");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: queue, isLoading } = useQuery({
    queryKey: ["enrichment-queue", tab],
    queryFn: () => apiFetch<QueueItem[]>(`/api/enrichment/queue?status=${tab}`),
    refetchInterval: tab === "PROCESSING" ? 3000 : false,
  });

  const { data: candidates } = useQuery({
    queryKey: ["enrichment-candidates"],
    queryFn: () => apiFetch<Candidate[]>("/api/enrichment/candidates"),
  });

  const processMutation = useMutation({
    mutationFn: () => apiFetch<{ count: number }>("/api/enrichment/process", { method: "POST" }),
    onSuccess: (data) => {
      toast.success(`Enriching ${data.count} queued contact(s) in the background`);
      queryClient.invalidateQueries({ queryKey: ["enrichment-queue"] });
    },
  });

  const enrichOneMutation = useMutation({
    mutationFn: (contactId: number) => apiFetch("/api/enrichment/enrich", { method: "POST", body: JSON.stringify({ contactId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrichment-queue"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Enrichment complete");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/enrichment/queue/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["enrichment-queue"] }),
  });

  const pushMutation = useMutation({
    mutationFn: (contactIds: number[]) =>
      apiFetch("/api/enrichment/push-to-prospecting", { method: "POST", body: JSON.stringify({ contactIds }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrichment-queue"] });
      toast.success("Pushed to Prospecting → Enriched Leads");
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
          <h1 className="text-xl font-semibold">Enrichment</h1>
          <p className="text-sm text-muted-foreground">Find emails and phone numbers, on your terms</p>
        </div>
        <div className="flex gap-2">
          <SearchNewContactDialog />
          <Button
            className="bg-primary text-primary-foreground"
            disabled={processMutation.isPending}
            onClick={() => processMutation.mutate()}
          >
            Enrich Queued Contacts
          </Button>
        </div>
      </div>

      {(candidates?.length ?? 0) > 0 && (
        <div className="mb-6 rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Search Results Awaiting Review</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {candidates?.map((c) => (
              <CandidateCard key={c.id} candidate={c} />
            ))}
          </div>
        </div>
      )}

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

      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border bg-secondary/40 px-4 py-2 text-sm">
          <span>{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => pushMutation.mutate([...selected])}>
            Push to Prospecting
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-secondary/40 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="p-3"></th>
              <th className="p-3">Name</th>
              <th className="p-3">Company</th>
              <th className="p-3">Email</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Lead</th>
              <th className="p-3">Provider</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!isLoading && (queue?.length ?? 0) === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nothing here.</td></tr>
            )}
            {queue?.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-3">
                  <input type="checkbox" checked={selected.has(item.contactId)} onChange={() => toggle(item.contactId)} />
                </td>
                <td className="p-3 font-medium">{item.name}</td>
                <td className="p-3 text-muted-foreground">{item.companyName || "—"}</td>
                <td className="p-3">{item.email || "—"}</td>
                <td className="p-3">{item.phone || "—"}</td>
                <td className="p-3">{item.leadStatus}</td>
                <td className="p-3 text-muted-foreground">{item.lastProvider || "—"}</td>
                <td className="p-3">
                  <div className="flex gap-1.5">
                    {item.status === "QUEUED" && (
                      <Button size="sm" variant="outline" onClick={() => enrichOneMutation.mutate(item.contactId)}>
                        Enrich
                      </Button>
                    )}
                    {item.status === "ENRICHED" && (
                      <Button size="sm" variant="outline" onClick={() => pushMutation.mutate([item.contactId])}>
                        Push
                      </Button>
                    )}
                    <button onClick={() => removeMutation.mutate(item.id)} className="text-muted-foreground hover:text-red-400">
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const queryClient = useQueryClient();
  const addMutation = useMutation({
    mutationFn: () => apiFetch(`/api/enrichment/candidates/${candidate.id}/add`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrichment-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Added to Leads");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Possible duplicate — check existing contacts");
    },
  });

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 font-semibold">
        {candidate.firstName} {candidate.lastName}
      </div>
      <div className="mb-1 text-xs text-muted-foreground">
        {candidate.jobTitle} {candidate.jobTitle && candidate.companyName ? "·" : ""} {candidate.companyName}
      </div>
      {candidate.emails.map((e) => (
        <div key={e.email} className="text-xs">
          {e.email} <span className="text-muted-foreground">({e.provider})</span>
        </div>
      ))}
      {candidate.phones.map((p) => (
        <div key={p.phone} className="text-xs">
          {p.phone} <span className="text-muted-foreground">({p.provider})</span>
        </div>
      ))}
      <div className="my-2 text-xs text-primary">
        Confidence: {candidate.confidence ?? 0}% ({confidenceLabel(candidate.confidence ?? 0)})
        {candidate.providerSources.length > 1 && ` · ${candidate.providerSources.length} providers agree`}
      </div>
      <Button size="sm" className="w-full bg-primary text-primary-foreground" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
        Add to Leads
      </Button>
    </div>
  );
}

function SearchNewContactDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", companyName: "", companyDomain: "", jobTitle: "", linkedinUrl: "",
  });

  const searchMutation = useMutation({
    mutationFn: () => apiFetch("/api/enrichment/search", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrichment-candidates"] });
      toast.success("Search complete — see results below");
      setOpen(false);
      setForm({ firstName: "", lastName: "", companyName: "", companyDomain: "", jobTitle: "", linkedinUrl: "" });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Search failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">+ Search New Contacts</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Search New Contacts</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            searchMutation.mutate();
          }}
        >
          <p className="text-xs text-muted-foreground">
            Provide a LinkedIn URL, or a full name plus company/domain. Name alone isn&apos;t enough for a confident match.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>First Name</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Last Name</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>Company Name</Label><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Company Domain</Label><Input placeholder="acme.com" value={form.companyDomain} onChange={(e) => setForm({ ...form, companyDomain: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Job Title</Label><Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>LinkedIn URL</Label><Input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} /></div>
          <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={searchMutation.isPending}>
            {searchMutation.isPending ? "Searching providers..." : "Search"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
