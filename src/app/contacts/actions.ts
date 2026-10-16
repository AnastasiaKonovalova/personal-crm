"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { contactSchema, firstErrors, noteSchema, type ContactField } from "@/lib/validation";
import { addNote, createContact } from "@/server/contacts";

export type ContactFormState = {
  values?: Partial<Record<ContactField, string>>;
  errors?: Partial<Record<ContactField, string>>;
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

export async function createContactAction(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const values: Record<ContactField, string> = {
    name: readString(formData, "name"),
    about: readString(formData, "about"),
    howWeMet: readString(formData, "howWeMet"),
    phone: readString(formData, "phone"),
    email: readString(formData, "email"),
  };

  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, errors: firstErrors(parsed.error) };
  }

  const id = await createContact(parsed.data);
  revalidatePath("/");
  redirect(`/contacts/${id}`);
}

// contactId comes from a hidden field rather than .bind(): a bound action never answers
// a form submitted without JavaScript (Next.js 16.4)
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
