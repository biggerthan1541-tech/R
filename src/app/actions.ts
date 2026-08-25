"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { createWorkspace, requireUser } from "@/lib/workspace";

export async function createWorkspaceAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const workspace = await createWorkspace(name, user.id);
  revalidatePath("/");
  redirect(`/w/${workspace.slug}`);
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
