"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type LeadRow = { id: number; name?: string; firstName?: string; lastName?: string | null; email: string | null; companyName: string | null };
type SendingAccount = { email: string; status: number | null; statusLabel: string | null; warmupStatus: number | null; dailyLimit: number | null };
type ValidationSummary = {
  selected: number;
  eligible: number;
  missingEmail: number;
  unsubscribed: number;
  bounced: number;
  doNotContact: number;
  alreadyInCampaign: number;
  eligibleContactIds: number[];
};
type Step = { subject: string; body: string; delayDays: number };

const STEPS = ["Basics", "Audience", "Sequence", "Sending Accounts", "Review"];

export default function NewEmailCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledContactIds = searchParams.get("contactIds") ?? "";
  const [step, setStep] = useState(0);
  const [campaignId, setCampaignId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [audienceSource, setAudienceSource] = useState<"hot" | "warm" | "ai-priority" | "custom">(
    prefilledContactIds ? "custom" : "hot"
  );
  const [customIds, setCustomIds] = useState(prefilledContactIds);
  const [validation, setValidation] = useState<ValidationSummary | null>(null);

  const [personalizationMode, setPersonalizationMode] = useState("standard");
  const [sequence, setSequence] = useState<Step[]>([
    { subject: "Quick question about {{companyName}}", body: "Hi {{firstName}},\n\n", delayDays: 0 },
  ]);

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [dailyLimit, setDailyLimit] = useState(50);
  const [stopOnReply, setStopOnReply] = useState(true);

  const { data: hotLeads } = useQuery({
    queryKey: ["leads", "Hot"],
    queryFn: () => apiFetch<LeadRow[]>("/api/leads?bucket=Hot"),
    enabled: audienceSource === "hot",
  });
  const { data: warmLeads } = useQuery({
    queryKey: ["leads", "Warm"],
    queryFn: () => apiFetch<LeadRow[]>("/api/leads?bucket=Warm"),
    enabled: audienceSource === "warm",
  });
  const { data: aiPriority } = useQuery({
    queryKey: ["ai-priority-audience"],
    queryFn: () => apiFetch<LeadRow[]>("/api/growth-intelligence/priority"),
    enabled: audienceSource === "ai-priority",
  });
  const { data: accounts } = useQuery({
    queryKey: ["instantly-accounts"],
    queryFn: () => apiFetch<SendingAccount[]>("/api/instantly/accounts"),
  });

  const audienceContactIds = (): number[] => {
    if (audienceSource === "hot") return (hotLeads ?? []).map((l) => l.id);
    if (audienceSource === "warm") return (warmLeads ?? []).map((l) => l.id);
    if (audienceSource === "ai-priority") return (aiPriority ?? []).map((l) => l.id);
    return customIds
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n) && n > 0);
  };

  const createCampaignMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id: number }>("/api/email-campaigns", {
        method: "POST",
        body: JSON.stringify({ name, description, personalizationMode, dailyLimit }),
      }),
    onSuccess: (c) => {
      setCampaignId(c.id);
      setStep(1);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const validateMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ summary: ValidationSummary }>(`/api/email-campaigns/${campaignId}/leads`, {
        method: "POST",
        body: JSON.stringify({ contactIds: audienceContactIds(), dryRun: true }),
      }),
    onSuccess: (r) => setValidation(r.summary),
    onError: (e: Error) => toast.error(e.message),
  });

  const addLeadsMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ summary: ValidationSummary; added: number }>(`/api/email-campaigns/${campaignId}/leads`, {
        method: "POST",
        body: JSON.stringify({ contactIds: validation?.eligibleContactIds ?? [] }),
      }),
    onSuccess: (r) => {
      toast.success(`Added ${r.added} eligible lead(s) to the campaign`);
      setStep(2);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateCopyMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ steps: Step[] }>(`/api/email-campaigns/${campaignId}/generate-copy`, {
        method: "POST",
        body: JSON.stringify({ audienceDescription: description || name }),
      }),
    onSuccess: (r) => {
      setSequence(r.steps);
      toast.success("AI-generated sequence ready — review before saving");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveStepsMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/email-campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({ steps: sequence }),
      }),
    onSuccess: () => setStep(3),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAccountsMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/email-campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({ sendingAccountEmails: selectedAccounts, dailyLimit, stopOnReply }),
      }),
    onSuccess: () => setStep(4),
    onError: (e: Error) => toast.error(e.message),
  });

  const launchMutation = useMutation({
    mutationFn: () => apiFetch(`/api/email-campaigns/${campaignId}/launch`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Campaign launched on Instantly");
      router.push(`/email-campaigns/${campaignId}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">Create Email Campaign</h1>
      <p className="mb-6 text-sm text-muted-foreground">Instantly remains the sending provider — this wizard only builds the campaign.</p>

      <div className="mb-6 flex gap-1 text-xs">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              "flex-1 rounded-full px-2 py-1 text-center font-medium",
              i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
            )}
          >
            {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Campaign Basics</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Campaign name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dental Owners | US | September 2026" />
            </div>
            <div className="space-y-1.5">
              <Label>Internal description / target audience</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dental practice owners, US, website conversion audit" />
            </div>
            <div className="space-y-1.5">
              <Label>Personalization mode</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={personalizationMode}
                onChange={(e) => setPersonalizationMode(e.target.value)}
              >
                <option value="standard">Standard (name/company variables only)</option>
                <option value="ai">AI Personalization</option>
                <option value="ai_growth_intelligence">AI + Growth Intelligence (recommended for qualified leads)</option>
              </select>
            </div>
            <Button
              className="bg-primary text-primary-foreground"
              disabled={!name || createCampaignMutation.isPending}
              onClick={() => createCampaignMutation.mutate()}
            >
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && campaignId && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Select Audience</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["hot", "warm", "ai-priority", "custom"] as const).map((src) => (
                <button
                  key={src}
                  onClick={() => {
                    setAudienceSource(src);
                    setValidation(null);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs capitalize",
                    audienceSource === src ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                  )}
                >
                  {src === "ai-priority" ? "AI Priority Leads" : src === "custom" ? "Custom contact IDs" : `${src} Leads`}
                </button>
              ))}
            </div>

            {audienceSource === "custom" && (
              <div className="space-y-1.5">
                <Label>Contact IDs (comma-separated)</Label>
                <Input value={customIds} onChange={(e) => setCustomIds(e.target.value)} placeholder="101, 102, 103" />
              </div>
            )}

            <div className="text-sm text-muted-foreground">Selected: {audienceContactIds().length} contact(s)</div>

            <Button variant="outline" disabled={audienceContactIds().length === 0 || validateMutation.isPending} onClick={() => validateMutation.mutate()}>
              Validate Leads
            </Button>

            {validation && (
              <div className="rounded-lg border p-4 text-sm">
                <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div>Selected: <b>{validation.selected}</b></div>
                  <div className="text-green-400">Eligible: <b>{validation.eligible}</b></div>
                  <div className="text-muted-foreground">Missing email: <b>{validation.missingEmail}</b></div>
                  <div className="text-muted-foreground">Invalid/unsubscribed: <b>{validation.unsubscribed}</b></div>
                  <div className="text-muted-foreground">Bounced: <b>{validation.bounced}</b></div>
                  <div className="text-muted-foreground">Already in campaign: <b>{validation.alreadyInCampaign}</b></div>
                </div>
                <Button
                  className="bg-primary text-primary-foreground"
                  disabled={validation.eligible === 0 || addLeadsMutation.isPending}
                  onClick={() => addLeadsMutation.mutate()}
                >
                  Add {validation.eligible} Eligible Lead(s)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && campaignId && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Email Sequence</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" disabled={generateCopyMutation.isPending} onClick={() => generateCopyMutation.mutate()}>
              {generateCopyMutation.isPending ? "Generating..." : "✨ Generate with AI"}
            </Button>

            {sequence.map((s, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>STEP {i + 1}{i > 0 ? ` — wait ${s.delayDays} day(s)` : ""}</span>
                  {sequence.length > 1 && (
                    <button className="text-red-400" onClick={() => setSequence(sequence.filter((_, idx) => idx !== i))}>
                      Delete Step
                    </button>
                  )}
                </div>
                <Input
                  value={s.subject}
                  placeholder="Subject"
                  onChange={(e) => setSequence(sequence.map((x, idx) => (idx === i ? { ...x, subject: e.target.value } : x)))}
                />
                <textarea
                  className="min-h-[120px] w-full rounded-md border bg-background p-2 text-sm"
                  value={s.body}
                  onChange={(e) => setSequence(sequence.map((x, idx) => (idx === i ? { ...x, body: e.target.value } : x)))}
                />
                {i > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <Label>Wait (days)</Label>
                    <Input
                      type="number"
                      className="w-20"
                      value={s.delayDays}
                      onChange={(e) => setSequence(sequence.map((x, idx) => (idx === i ? { ...x, delayDays: Number(e.target.value) } : x)))}
                    />
                  </div>
                )}
              </div>
            ))}

            <Button
              variant="outline"
              onClick={() => setSequence([...sequence, { subject: "", body: "", delayDays: 3 }])}
            >
              + Add Step
            </Button>

            <div>
              <Button className="bg-primary text-primary-foreground" disabled={saveStepsMutation.isPending} onClick={() => saveStepsMutation.mutate()}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && campaignId && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Sending Accounts</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {(!accounts || accounts.length === 0) && (
              <p className="text-sm text-muted-foreground">
                No sending accounts found. Connect a mailbox in your Instantly workspace, then
                Refresh Accounts &amp; Campaigns on the Settings page.
              </p>
            )}
            <div className="space-y-2">
              {accounts?.map((a) => (
                <label key={a.email} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedAccounts.includes(a.email)}
                      onChange={(e) =>
                        setSelectedAccounts(
                          e.target.checked ? [...selectedAccounts, a.email] : selectedAccounts.filter((x) => x !== a.email)
                        )
                      }
                    />
                    <span>{a.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Status: {a.statusLabel ?? "Unknown"}</span>
                    <span>Daily limit: {a.dailyLimit ?? "—"}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Campaign daily limit</Label>
                <Input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} />
              </div>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={stopOnReply} onChange={(e) => setStopOnReply(e.target.checked)} />
                Stop sending on reply
              </label>
            </div>
            <Button
              className="bg-primary text-primary-foreground"
              disabled={selectedAccounts.length === 0 || saveAccountsMutation.isPending}
              onClick={() => saveAccountsMutation.mutate()}
            >
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 4 && campaignId && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Campaign Review</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Name:</span> {name}</div>
            <div><span className="text-muted-foreground">Sequence:</span> {sequence.length} email(s)</div>
            <div><span className="text-muted-foreground">Sending accounts:</span> {selectedAccounts.length}</div>
            <div><span className="text-muted-foreground">Daily limit:</span> {dailyLimit}</div>
            <div><span className="text-muted-foreground">Stop on reply:</span> {stopOnReply ? "ON" : "OFF"}</div>
            <p className="rounded-md bg-secondary/40 p-3 text-xs text-muted-foreground">
              Launching creates the campaign on Instantly and pushes your validated leads to it.
              Nothing sends until you confirm below.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
              <Button className="bg-primary text-primary-foreground" disabled={launchMutation.isPending} onClick={() => launchMutation.mutate()}>
                {launchMutation.isPending ? "Launching..." : "Launch Campaign"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
