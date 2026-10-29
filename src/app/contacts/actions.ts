"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { contactSchema, firstErrors, noteSchema, type ContactField } from "@/lib/validation";
import { addNote, createContact, deleteContact, updateContact, updateNote } from "@/server/contacts";

export type ContactFormState = {
  values?: Partial<Record<ContactField, string>>;
  errors?: Partial<Record<ContactField, string>>;
  formError?: string;
};

export type NoteFormState = {
  body?: string;
  error?: string;
  savedAt?: number;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readContactValues(formData: FormData): Record<ContactField, string> {
  return {
    name: readString(formData, "name"),
    about: readString(formData, "about"),
    howWeMet: readString(formData, "howWeMet"),
    phone: readString(formData, "phone"),
    email: readString(formData, "email"),
  };
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
  revalidatePath("/");
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
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, errors: firstErrors(parsed.error) };
  }

  const id = await updateContact(contactId, parsed.data);
  if (!id) {
    return { values, formError: "Контакт не найден" };
  }

  revalidatePath("/");
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}`);
}

// A contact already deleted elsewhere is not an error: the list is the same either way
export async function deleteContactAction(formData: FormData) {
  const contactId = readString(formData, "contactId");
  await deleteContact(contactId);

  revalidatePath("/");
  revalidatePath(`/contacts/${contactId}`);
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

  revalidatePath(`/contacts/${contactId}`);
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
