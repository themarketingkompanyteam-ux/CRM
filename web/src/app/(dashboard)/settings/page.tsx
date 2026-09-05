"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type TwilioStatus = {
  connected: boolean;
  accountSid?: string;
  apiKeySid?: string;
  fromPhone?: string;
};

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
    </div>
  );
}
