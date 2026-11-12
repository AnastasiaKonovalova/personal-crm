"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  cadenceSchemaFor,
  contactSchema,
  contactSchemaFor,
  firstErrors,
  groupNameSchema,
  noteSchema,
  type ContactField,
} from "@/lib/validation";
import {
  addContactToGroup,
  addNote,
  createContact,
  deleteContact,
  getContact,
  removeContactFromGroup,
  setCadence,
  updateContact,
  updateNote,
} from "@/server/contacts";

// The text fields plus the group ticks and the "Новая группа" text, returned as typed on an error
export type ContactFormValues = Record<ContactField, string> & { groupIds: string[]; newGroup: string };

export type ContactFormState = {
  values?: Partial<ContactFormValues>;
  errors?: Partial<Record<ContactField | "groupIds" | "newGroup", string>>;
  formError?: string;
};

export type GroupFieldState = {
  groupName?: string;
  error?: string;
  savedAt?: number;
};

export type CadenceFormState = {
  values?: { cadence: string; contactOn: string };
  errors?: { cadence?: string; contactOn?: string };
  formError?: string;
  savedAt?: number;
};

export type MarkContactedState = {
  error?: string;
  savedAt?: number;
};

const CONTACTED_NOTE = "Связались";

export type NoteFormState = {
  body?: string;
  error?: string;
  savedAt?: number;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// Ticked groups come as several values of one field
function readStrings(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is string => typeof value === "string");
}

function readContactValues(formData: FormData): ContactFormValues {
  return {
    name: readString(formData, "name"),
    about: readString(formData, "about"),
    howWeMet: readString(formData, "howWeMet"),
    phone: readString(formData, "phone"),
    email: readString(formData, "email"),
    cadence: readString(formData, "cadence"),
    contactOn: readString(formData, "contactOn"),
    groupIds: readStrings(formData, "groupIds"),
    newGroup: readString(formData, "newGroup"),
  };
}

// A plain form post (no JavaScript) has no `next-action` header
async function calledFromJs() {
  return (await headers()).has("next-action");
}

export async function createContactAction(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const values = readContactValues(formData);
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, errors: firstErrors(parsed.error) };
  }

  const id = await createContact(parsed.data);
  // A new group may have appeared: the groups page and the filter change too
  revalidatePath("/", "layout");
  redirect(`/contacts/${id}`);
}

// Ids come from hidden fields rather than .bind(): a bound action never answers
// a form submitted without JavaScript (Next.js 16.4)
export async function updateContactAction(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const contactId = readString(formData, "contactId");
  const values = readContactValues(formData);

  // The saved date may stay even if it has passed, so validation needs to know it
  const saved = await getContact(contactId);
  if (!saved) {
    return { values, formError: "Контакт не найден" };
  }
  const parsed = contactSchemaFor(saved.contactOn).safeParse(values);
  if (!parsed.success) {
    return { values, errors: firstErrors(parsed.error) };
  }

  const id = await updateContact(contactId, parsed.data);
  if (!id) {
    return { values, formError: "Контакт не найден" };
  }

  revalidatePath("/", "layout");
  redirect(`/contacts/${id}`);
}

// A contact already deleted elsewhere is not an error: the list is the same either way
export async function deleteContactAction(formData: FormData) {
  const contactId = readString(formData, "contactId");
  await deleteContact(contactId);

  // Group counts on the groups page change too
  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}

export async function addNoteAction(
  _previous: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const contactId = readString(formData, "contactId");
  const body = readString(formData, "body");
  const parsed = noteSchema.safeParse({ body });
  if (!parsed.success) {
    return { body, error: firstErrors(parsed.error).body };
  }

  const note = await addNote(contactId, parsed.data.body);
  if (!note) {
    return { body, error: "Контакт не найден" };
  }

  // A new note moves the contact's term, so the "Пора связаться" block on the home page changes too
  revalidatePath("/");
  revalidatePath(`/contacts/${contactId}`);
  return { savedAt: Date.now() };
}

// Changes the frequency from the contact card
export async function setCadenceAction(
  _previous: CadenceFormState,
  formData: FormData,
): Promise<CadenceFormState> {
  const contactId = readString(formData, "contactId");
  const values = {
    cadence: readString(formData, "cadence"),
    contactOn: readString(formData, "contactOn"),
  };

  const saved = await getContact(contactId);
  if (!saved) {
    return { values, formError: "Контакт не найден" };
  }
  const parsed = cadenceSchemaFor(saved.contactOn).safeParse(values);
  if (!parsed.success) {
    return { values, errors: firstErrors(parsed.error) };
  }

  const id = await setCadence(contactId, parsed.data);
  if (!id) {
    return { values, formError: "Контакт не найден" };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${id}`);
  return { savedAt: Date.now() };
}

// "Связались" is a regular new note, so it follows the same rules (term restart, date clearing).
// A plain form post (no JavaScript) gets a redirect to `returnTo`, so refreshing the page cannot
// send the form again and add the note twice. A call from JavaScript carries the `next-action`
// header and updates the page in place: no redirect, so the block keeps its expansion and page.
export async function markContactedAction(
  _previous: MarkContactedState,
  formData: FormData,
): Promise<MarkContactedState> {
  const contactId = readString(formData, "contactId");
  const returnTo = readString(formData, "returnTo");

  const note = await addNote(contactId, CONTACTED_NOTE);
  if (!note) {
    return { error: "Контакт не найден" };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${contactId}`);
  if (!(await calledFromJs())) {
    if (returnTo === "/") redirect("/");
    if (returnTo === "card") redirect(`/contacts/${contactId}`);
  }
  return { savedAt: Date.now() };
}

export async function updateNoteAction(
  _previous: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const contactId = readString(formData, "contactId");
  const noteId = readString(formData, "noteId");
  const body = readString(formData, "body");
  const parsed = noteSchema.safeParse({ body });
  if (!parsed.success) {
    return { body, error: firstErrors(parsed.error).body };
  }

  const note = await updateNote(contactId, noteId, parsed.data.body);
  if (!note) {
    return { body, error: "Заметка не найдена" };
  }

  revalidatePath(`/contacts/${contactId}`);
  return { savedAt: Date.now() };
}

// The card field "Группа: выбрать или новая": an existing name adds the contact to that group,
// a new name creates it. Without JavaScript it returns to the card, like "Связались".
export async function addContactToGroupAction(
  _previous: GroupFieldState,
  formData: FormData,
): Promise<GroupFieldState> {
  const contactId = readString(formData, "contactId");
  const groupName = readString(formData, "groupName");
  const parsed = groupNameSchema.safeParse({ name: groupName });
  if (!parsed.success) {
    return { groupName, error: firstErrors(parsed.error).name };
  }

  const groupId = await addContactToGroup(contactId, parsed.data.name);
  if (!groupId) {
    return { groupName, error: "Контакт не найден" };
  }

  revalidatePath("/", "layout");
  if (!(await calledFromJs())) {
    redirect(`/contacts/${contactId}`);
  }
  return { savedAt: Date.now() };
}

// "Убрать" in the confirmation dialog. The redirect drops ?removeGroup= and closes the dialog,
// with and without JavaScript; a membership already removed elsewhere is not an error
export async function removeContactFromGroupAction(formData: FormData) {
  const contactId = readString(formData, "contactId");
  const groupId = readString(formData, "groupId");
  await removeContactFromGroup(contactId, groupId);

  revalidatePath("/", "layout");
  redirect(`/contacts/${contactId}`);
}
