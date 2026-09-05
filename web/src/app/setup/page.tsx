import { redirect } from "next/navigation";
import { anyUsersExist, createFirstAdmin } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth-card";

export default async function SetupPage() {
  if (await anyUsersExist()) {
    redirect("/login");
  }

  return (
    <AuthCard
      heading="Create your admin account"
      subtitle="This is a one-time setup. You'll use this to log in from now on."
      action={createFirstAdmin}
      submitLabel="Create account"
    />
  );
}
