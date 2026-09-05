"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, Company } from "@/lib/api";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: () => apiFetch<Company[]>("/api/companies"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/companies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Companies</h1>
          <p className="text-sm text-muted-foreground">Accounts and organizations</p>
        </div>
        <AddCompanyDialog />
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Contacts</TableHead>
              <TableHead>Deals</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No companies yet.
                </TableCell>
              </TableRow>
            )}
            {data?.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.industry || "—"}</TableCell>
                <TableCell>{c.location || "—"}</TableCell>
                <TableCell>{c.contactCount}</TableCell>
                <TableCell>{c.dealCount}</TableCell>
                <TableCell className="text-right">
                  <button
                    onClick={() => deleteMutation.mutate(c.id)}
                    className="text-muted-foreground hover:text-red-400"
                  >
                    🗑️
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AddCompanyDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/api/companies", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      toast.success("Company added");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button className="bg-primary text-primary-foreground">+ Add Company</Button>}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Company</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            mutation.mutate({
              name: fd.get("name"),
              industry: fd.get("industry"),
              website: fd.get("website"),
              location: fd.get("location"),
            });
          }}
        >
          <div className="space-y-1.5">
            <Label>Company Name</Label>
            <Input name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label>Industry</Label>
            <Input name="industry" />
          </div>
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input name="website" />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input name="location" />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
