"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { firstErrors, groupNameSchema } from "@/lib/validation";
import { createGroup, deleteGroup, renameGroup } from "@/server/groups";
import { requireUser } from "@/server/session";

// Actions of the «Группы» page. Ids come from hidden fields rather than .bind(): a bound action
// never answers a form submitted without JavaScript (Next.js 16.4). Group names appear in cards,
// rows and the filter, so every change revalidates all pages.
// Every action starts with requireUser(): without a session nothing below runs.

export type GroupFormState = {
  name?: string;
  error?: string;
  savedAt?: number;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function validName(name: string) {
  const parsed = groupNameSchema.safeParse({ name });
  return parsed.success ? { name: parsed.data.name } : { error: firstErrors(parsed.error).name };
}

// Without JavaScript the page is reloaded by a redirect, so refreshing cannot send the form again
export async function createGroupAction(
  _previous: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const user = await requireUser();
  const name = readString(formData, "name");
  const valid = validName(name);
  if ("error" in valid) {
    return { name, error: valid.error };
  }

  const result = await createGroup(user.id, valid.name);
  if ("error" in result) {
    return { name, error: result.error };
  }

  revalidatePath("/", "layout");
  if (!(await headers()).has("next-action")) {
    redirect("/groups");
  }
  return { savedAt: Date.now() };
}

// Renaming happens on /groups?edit=<id>; success redirects to /groups and closes the edit mode
export async function renameGroupAction(
  _previous: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const user = await requireUser();
  const groupId = readString(formData, "groupId");
  const name = readString(formData, "name");
  const valid = validName(name);
  if ("error" in valid) {
    return { name, error: valid.error };
  }

  const result = await renameGroup(user.id, groupId, valid.name);
  if (!result) {
    return { name, error: "Группа не найдена" };
  }
  if ("error" in result) {
    return { name, error: result.error };
  }

  revalidatePath("/", "layout");
  redirect("/groups");
}

// "Удалить" in the confirmation dialog (/groups?delete=<id>). The redirect closes the dialog,
// with and without JavaScript; a group already deleted elsewhere is not an error
export async function deleteGroupAction(formData: FormData) {
  const user = await requireUser();
  await deleteGroup(user.id, readString(formData, "groupId"));

  revalidatePath("/", "layout");
  redirect("/groups");
}
