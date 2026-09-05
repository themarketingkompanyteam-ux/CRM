"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, Deal } from "@/lib/api";
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
import { toast } from "sonner";

function fmtMoney(n: number) {
  return "$" + Math.round(n).toLocaleString();
}

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const { data: stagesData } = useQuery({
    queryKey: ["deal-stages"],
    queryFn: () => apiFetch<{ stages: string[] }>("/api/deals/stages"),
  });
  const { data: deals } = useQuery({
    queryKey: ["deals"],
    queryFn: () => apiFetch<Deal[]>("/api/deals"),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: string }) =>
      apiFetch(`/api/deals/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const stages = stagesData?.stages ?? [];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Drag deals between stages</p>
        </div>
        <AddDealDialog stages={stages} />
      </div>

      <div className="flex gap-3.5 overflow-x-auto pb-2">
        {stages.map((stage) => {
          const stageDeals = deals?.filter((d) => d.stage === stage) ?? [];
          const total = stageDeals.reduce((sum, d) => sum + d.value, 0);
          return (
            <div
              key={stage}
              className="min-w-[260px] flex-1 rounded-xl border bg-card p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData("text/plain"));
                if (id) stageMutation.mutate({ id, stage });
              }}
            >
              <div className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">
                <span>{stage}</span>
                <span className="font-normal text-muted-foreground">
                  {stageDeals.length} · {fmtMoney(total)}
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {stageDeals.map((deal) => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", String(deal.id))
                    }
                    className="cursor-grab rounded-lg border bg-secondary/40 p-3 active:cursor-grabbing"
                  >
                    <div className="mb-1.5 text-sm font-semibold">{deal.title}</div>
                    <div className="mb-1.5 text-sm font-bold text-primary">
                      {fmtMoney(deal.value)}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{deal.contactName?.trim() || deal.companyName || "Unassigned"}</span>
                      <span>{deal.probability}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddDealDialog({ stages }: { stages: string[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/api/deals", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      toast.success("Deal added");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button className="bg-primary text-primary-foreground">+ Add Deal</Button>}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Deal</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            mutation.mutate({
              title: fd.get("title"),
              value: Number(fd.get("value") || 0),
              stage: fd.get("stage") || "New",
              closeDate: fd.get("closeDate"),
              notes: fd.get("notes"),
            });
          }}
        >
          <div className="space-y-1.5">
            <Label>Deal Title</Label>
            <Input name="title" required />
          </div>
          <div className="space-y-1.5">
            <Label>Value ($)</Label>
            <Input name="value" type="number" step="0.01" defaultValue={0} />
          </div>
          <div className="space-y-1.5">
            <Label>Stage</Label>
            <select
              name="stage"
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              defaultValue="New"
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Close Date</Label>
            <Input name="closeDate" type="date" />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
