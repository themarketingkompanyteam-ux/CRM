"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TwilioStatus = {
  connected: boolean;
  accountSid?: string;
  apiKeySid?: string;
  fromPhone?: string;
};

type EnrichmentProvider = {
  key: string;
  label: string;
  configured: boolean;
  enabled: boolean;
  priority: number;
  supportsEmail: boolean;
  supportsPhone: boolean;
  status: string;
  creditsRemaining: number | null;
  lastErrorMessage: string | null;
  usageCount: number;
  successCount: number;
  failureCount: number;
};

const STATUS_COLORS: Record<string, string> = {
  CONNECTED: "bg-green-950 text-green-400",
  AUTH_ERROR: "bg-red-950 text-red-400",
  RATE_LIMITED: "bg-amber-950 text-amber-400",
  OUT_OF_CREDITS: "bg-amber-950 text-amber-400",
  UNKNOWN: "bg-secondary text-muted-foreground",
};

function EnrichmentProvidersSection() {
  const queryClient = useQueryClient();
  const { data: providers } = useQuery({
    queryKey: ["enrichment-providers"],
    queryFn: () => apiFetch<EnrichmentProvider[]>("/api/enrichment/providers"),
  });

  const testMutation = useMutation({
    mutationFn: (key: string) => apiFetch<{ ok: boolean; message: string }>(`/api/enrichment/providers/${key}/test`, { method: "POST" }),
    onSuccess: (data, key) => {
      queryClient.invalidateQueries({ queryKey: ["enrichment-providers"] });
      if (data.ok) toast.success(`${key}: ${data.message}`);
      else toast.error(`${key}: ${data.message}`);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      apiFetch(`/api/enrichment/providers/${key}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["enrichment-providers"] }),
  });

  return (
    <Card className="mt-6 max-w-4xl">
      <CardHeader>
        <CardTitle className="text-sm">🔌 Enrichment Providers</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted-foreground">
                <th className="pb-2 pr-3">Provider</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Credits</th>
                <th className="pb-2 pr-3">Priority</th>
                <th className="pb-2 pr-3">Email</th>
                <th className="pb-2 pr-3">Phone</th>
                <th className="pb-2 pr-3">Used / OK / Fail</th>
                <th className="pb-2 pr-3">Enabled</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers?.map((p) => (
                <tr key={p.key} className="border-t">
                  <td className="py-2 pr-3 font-medium">{p.label}</td>
                  <td className="py-2 pr-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_COLORS[p.status] ?? STATUS_COLORS.UNKNOWN)}>
                      {p.configured ? p.status : "NOT CONFIGURED"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {p.creditsRemaining === null ? "Balance unavailable" : p.creditsRemaining}
                  </td>
                  <td className="py-2 pr-3">{p.priority}</td>
                  <td className="py-2 pr-3">{p.supportsEmail ? "✓" : "—"}</td>
                  <td className="py-2 pr-3">{p.supportsPhone ? "✓" : "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {p.usageCount} / {p.successCount} / {p.failureCount}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => toggleMutation.mutate({ key: p.key, enabled: e.target.checked })}
                    />
                  </td>
                  <td className="py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!p.configured || testMutation.isPending}
                      onClick={() => testMutation.mutate(p.key)}
                    >
                      Test
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Enrichment credits are only spent when you explicitly enrich a lead, push leads to the
          Enrichment queue, or search for a new contact — never automatically for every contact.
        </p>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings", "twilio"],
    queryFn: () => apiFetch<TwilioStatus>("/api/settings/twilio"),
  });

  const [form, setForm] = useState({
    accountSid: "",
    apiKeySid: "",
    apiKeySecret: "",
    fromPhone: "",
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/settings/twilio", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "twilio"] });
      toast.success("Twilio connected");
      setForm({ accountSid: "", apiKeySid: "", apiKeySecret: "", fromPhone: "" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch("/api/settings/twilio", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "twilio"] });
      toast.success("Twilio disconnected");
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Connect integrations and manage your workspace</p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            📞 Twilio Calling
            {data?.connected && (
              <span className="rounded-full bg-green-950 px-2 py-0.5 text-[11px] font-semibold text-green-400">
                Connected
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.connected ? (
            <div className="space-y-3 text-sm">
              <div className="text-muted-foreground">
                Account SID: <span className="text-foreground">{data.accountSid}</span>
              </div>
              <div className="text-muted-foreground">
                API Key SID: <span className="text-foreground">{data.apiKeySid}</span>
              </div>
              <div className="text-muted-foreground">
                From number: <span className="text-foreground">{data.fromPhone}</span>
              </div>
              <Button
                variant="outline"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Not connected. Prospecting calls will run in simulated mode until you connect
                Twilio here — nothing dials for real without this.
              </p>
              <div className="space-y-1.5">
                <Label>Account SID</Label>
                <Input
                  value={form.accountSid}
                  onChange={(e) => setForm({ ...form, accountSid: e.target.value })}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
              <div className="space-y-1.5">
                <Label>API Key SID</Label>
                <Input
                  value={form.apiKeySid}
                  onChange={(e) => setForm({ ...form, apiKeySid: e.target.value })}
                  placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
              <div className="space-y-1.5">
                <Label>API Key Secret</Label>
                <Input
                  type="password"
                  value={form.apiKeySecret}
                  onChange={(e) => setForm({ ...form, apiKeySecret: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>From Phone Number</Label>
                <Input
                  value={form.fromPhone}
                  onChange={(e) => setForm({ ...form, fromPhone: e.target.value })}
                  placeholder="+15551234567"
                />
              </div>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="bg-primary text-primary-foreground"
              >
                {saveMutation.isPending ? "Connecting..." : "Connect Twilio"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <EnrichmentProvidersSection />
    </div>
  );
}
