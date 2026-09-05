"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type ActionResult = { error?: string } | undefined;

export function AuthCard({
  heading,
  subtitle,
  action,
  submitLabel,
}: {
  heading: string;
  subtitle: string;
  action: (formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult,
    FormData
  >(async (_prev, formData) => action(formData), undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-[360px] rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2 text-lg font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime-400 font-extrabold text-black">
            W
          </span>
          Workspace
        </div>
        <h1 className="mb-1 text-lg font-semibold">{heading}</h1>
        <p className="mb-5 text-sm text-muted-foreground">{subtitle}</p>
        {state?.error && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-400">
            {state.error}
          </div>
        )}
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-lime-400 text-black hover:bg-lime-300"
          >
            {pending ? "Please wait..." : submitLabel}
          </Button>
        </form>
      </div>
    </div>
  );
}
