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
  dkimOptional: number;
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

type HostingerRecord = { name: string; type: string; ttl: number; records: { content: string }[] };

function HostingerDnsDialog({ domainId, domainName }: { domainId: number; domainName: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("@");
  const [type, setType] = useState("TXT");
  const [content, setContent] = useState("");
  const [ttl, setTtl] = useState(300);

  const { data: records, isLoading } = useQuery({
    queryKey: ["hostinger-records", domainId],
    queryFn: () => apiFetch<HostingerRecord[]>(`/api/domains/${domainId}/hostinger-records`),
    enabled: open,
  });

  const pushMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/domains/${domainId}/hostinger-records`, {
        method: "POST",
        body: JSON.stringify({ records: [{ name, type, ttl, content }] }),
      }),
    onSuccess: async () => {
      toast.success(`Record pushed to Hostinger — re-checking ${domainName}...`);
      queryClient.invalidateQueries({ queryKey: ["hostinger-records", domainId] });
      await apiFetch(`/api/domains/${domainId}/check`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["domains"] });
      setContent("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline">Manage DNS</Button>} />
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Hostinger DNS — {domainName}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Current records</div>
            {isLoading && <p className="text-muted-foreground">Loading...</p>}
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              {records?.map((r, i) => (
                <div key={i} className="rounded-md border p-2 text-xs">
                  <span className="font-semibold">{r.type}</span> {r.name} (TTL {r.ttl})
                  {r.records.map((rec, j) => <div key={j} className="text-muted-foreground">{rec.content}</div>)}
                </div>
              ))}
              {records && records.length === 0 && <p className="text-muted-foreground">No records found.</p>}
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Add / update a record</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <select className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
                  {["MX", "TXT", "CNAME", "A"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Name (@ for root, _dmarc for DMARC)</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <div className="mt-2 space-y-1">
              <Label className="text-xs">Content / value</Label>
              <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="v=spf1 include:_spf.google.com ~all" />
            </div>
            <div className="mt-2 space-y-1">
              <Label className="text-xs">TTL (seconds)</Label>
              <Input type="number" className="w-28" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} />
            </div>
            <Button
              className="mt-3 bg-primary text-primary-foreground"
              disabled={!content || pushMutation.isPending}
              onClick={() => pushMutation.mutate()}
            >
              {pushMutation.isPending ? "Pushing..." : "Push to Hostinger"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

  const toggleDkimOptionalMutation = useMutation({
    mutationFn: ({ id, dkimOptional }: { id: number; dkimOptional: boolean }) =>
      apiFetch<Domain>(`/api/domains/${id}`, { method: "PATCH", body: JSON.stringify({ dkimOptional: dkimOptional ? 1 : 0 }) }),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["domains"] });
      toast.success(d.dkimOptional ? `DKIM requirement relaxed for ${d.domain}` : `DKIM requirement restored for ${d.domain}`);
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
                  <td className="p-3">
                    <CheckBadge status={d.dkimOptional ? "pass" : d.dkimStatus} />
                    {d.dkimOptional === 1 && <div className="text-[10px] text-amber-400">exempted</div>}
                    <label className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground" title="Don't require DKIM for this domain — only for domains you don't control the DNS of (e.g. a personal test address). Leave off for any domain you own and send real campaigns from.">
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={!!d.dkimOptional}
                        onChange={(e) => toggleDkimOptionalMutation.mutate({ id: d.id, dkimOptional: e.target.checked })}
                      />
                      skip DKIM
                    </label>
                  </td>
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
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" disabled={checkMutation.isPending} onClick={() => checkMutation.mutate(d.id)}>
                        Run Check
                      </Button>
                      <HostingerDnsDialog domainId={d.id} domainName={d.domain} />
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
