"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { signIn, signOut } from "@/auth";
import { sql } from "drizzle-orm";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function anyUsersExist(): Promise<boolean> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(users);
  return Number(row?.count ?? 0) > 0;
}

export async function createFirstAdmin(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (await anyUsersExist()) {
    redirect("/login");
  }

  if (!username || password.length < 8) {
    return { error: "Username required and password must be at least 8 characters." };
  }

  await db.insert(users).values({
    username,
    passwordHash: await hashPassword(password),
  });

  redirect("/login");
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      username,
      password,
      redirectTo: "/",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid username or password." };
    }
    throw err;
  }
}
