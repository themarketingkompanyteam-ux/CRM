"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Domain = {
  id: number;
  domain: string;
  status: string;
  dkimSelector: string | null;
  mxStatus: string;
  spfStatus: string;
  dkimStatus: string;
  dmarcStatus: string;
  checkReasons: string[];
  domainHealthScore: number;
  dnsLastCheckedAt: string | null;
  mailboxCount: number;
  dailyCapacity: number;
};

function SetSelectorInline({ current, onSave }: { current: string | null; onSave: (selector: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? "");

  if (current) {
    return <div className="text-[11px] font-normal text-muted-foreground">DKIM selector: {current}</div>;
  }
  if (!editing) {
    return (
      <button className="block text-[11px] font-normal text-amber-400 underline" onClick={() => setEditing(true)}>
        No DKIM selector set — click to add
      </button>
    );
  }
  return (
    <div className="mt-1 flex items-center gap-1">
      <Input
        className="h-7 w-28 text-xs"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="google"
        autoFocus
      />
      <Button
        size="sm"
        className="h-7 bg-primary px-2 text-primary-foreground"
        onClick={() => {
          if (value.trim()) {
            onSave(value.trim());
            setEditing(false);
          }
        }}
      >
        Save
      </Button>
    </div>
  );
}

function CheckBadge({ status }: { status: string }) {
  const map: Record<string, { icon: string; cls: string }> = {
    pass: { icon: "✓", cls: "text-green-400" },
    fail: { icon: "✗", cls: "text-red-400" },
    unknown: { icon: "?", cls: "text-muted-foreground" },
  };
  const s = map[status] ?? map.unknown;
  return <span className={cn("font-bold", s.cls)}>{s.icon}</span>;
}

export default function DomainsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [selectorInput, setSelectorInput] = useState("");

  const { data: domains, isLoading } = useQuery({
    queryKey: ["domains"],
    queryFn: () => apiFetch<Domain[]>("/api/domains"),
    refetchInterval: 30000,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      apiFetch<Domain>("/api/domains", { method: "POST", body: JSON.stringify({ domain: domainInput, dkimSelector: selectorInput || undefined }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["domains"] });
      toast.success("Domain added — DNS check complete");
      setDomainInput("");
      setSelectorInput("");
      setAddOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkMutation = useMutation({
    mutationFn: (id: number) => apiFetch<Domain>(`/api/domains/${id}/check`, { method: "POST" }),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["domains"] });
      toast.success(`${d.domain}: health ${d.domainHealthScore}/100`);
    },
  });

  const setSelectorMutation = useMutation({
    mutationFn: ({ id, dkimSelector }: { id: number; dkimSelector: string }) =>
      apiFetch<Domain>(`/api/domains/${id}`, { method: "PATCH", body: JSON.stringify({ dkimSelector }) }),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["domains"] });
      toast.success(`DKIM selector saved for ${d.domain} — ${d.dkimStatus === "pass" ? "verified" : "still not verified, check the selector"}`);
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Domains</h1>
          <p className="text-sm text-muted-foreground">
            DNS authentication (MX/SPF/DKIM/DMARC) — mailboxes on a failing domain can&apos;t send
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button className="bg-primary text-primary-foreground">+ Add Domain</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Add Domain</DialogTitle></DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="space-y-1.5">
                <Label>Domain</Label>
                <Input value={domainInput} onChange={(e) => setDomainInput(e.target.value)} placeholder="tmkagency.com" />
              </div>
              <div className="space-y-1.5">
                <Label>DKIM selector (optional — required to verify DKIM)</Label>
                <Input value={selectorInput} onChange={(e) => setSelectorInput(e.target.value)} placeholder="google, selector1, s1..." />
              </div>
              <p className="text-xs text-muted-foreground">
                DKIM can&apos;t be discovered via DNS alone — without a selector it&apos;s reported as unknown, never falsely marked pass or fail.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button className="bg-primary text-primary-foreground" disabled={!domainInput || addMutation.isPending} onClick={() => addMutation.mutate()}>
                  {addMutation.isPending ? "Checking..." : "Add & Check"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-secondary/40 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Domain</th>
                <th className="p-3">MX</th>
                <th className="p-3">SPF</th>
                <th className="p-3">DKIM</th>
                <th className="p-3">DMARC</th>
                <th className="p-3">Health</th>
                <th className="p-3">Mailboxes</th>
                <th className="p-3">Daily Capacity</th>
                <th className="p-3">Last Checked</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Loading...</td></tr>}
              {!isLoading && (domains?.length ?? 0) === 0 && (
                <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No domains yet — add one, or add a mailbox and its domain is created automatically.</td></tr>
              )}
              {domains?.map((d) => (
                <tr key={d.id} className="border-t align-top">
                  <td className="p-3 font-medium">
                    {d.domain}
                    <SetSelectorInline current={d.dkimSelector} onSave={(sel) => setSelectorMutation.mutate({ id: d.id, dkimSelector: sel })} />
                  </td>
                  <td className="p-3"><CheckBadge status={d.mxStatus} /></td>
                  <td className="p-3"><CheckBadge status={d.spfStatus} /></td>
                  <td className="p-3"><CheckBadge status={d.dkimStatus} /></td>
                  <td className="p-3"><CheckBadge status={d.dmarcStatus} /></td>
                  <td className="p-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", d.domainHealthScore >= 90 ? "bg-green-950 text-green-400" : d.domainHealthScore >= 60 ? "bg-amber-950 text-amber-400" : "bg-red-950 text-red-400")}>
                      {d.domainHealthScore}/100
                    </span>
                    {d.checkReasons?.length > 0 && d.checkReasons[0] !== "All required authentication records verified." && (
                      <div className="mt-1 max-w-[220px] text-[11px] text-muted-foreground">{d.checkReasons.join("; ")}</div>
                    )}
                  </td>
                  <td className="p-3">{d.mailboxCount}</td>
                  <td className="p-3">{d.dailyCapacity}/day</td>
                  <td className="p-3 text-muted-foreground">{d.dnsLastCheckedAt ? new Date(d.dnsLastCheckedAt).toLocaleString() : "Never"}</td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" disabled={checkMutation.isPending} onClick={() => checkMutation.mutate(d.id)}>
                      Run Check
                    </Button>
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
