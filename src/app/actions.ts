"use server";

import { redirect } from "next/navigation";
import { clearSession, setSession } from "@/lib/session";
import { getUserById } from "@/lib/users";

/** Only allow same-site relative redirects after sign-in. */
function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/docs";
}

export async function signIn(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const user = await getUserById(userId);
  if (!user) redirect("/login?error=unknown_user");
  await setSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  await clearSession();
  redirect("/login");
}
