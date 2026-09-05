import { redirect } from "next/navigation";
import { anyUsersExist, loginAction } from "@/app/actions/auth";
import { auth } from "@/auth";
import { AuthCard } from "@/components/auth-card";

export default async function LoginPage() {
  if (!(await anyUsersExist())) {
    redirect("/setup");
  }
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <AuthCard
      heading="Welcome back"
      subtitle="Log in to your CRM."
      action={loginAction}
      submitLabel="Continue"
    />
  );
}
