import { z } from "zod";
import { CADENCES, type Cadence, toDateString } from "@/lib/keep-in-touch";

// Error messages are user-facing, hence in Russian

const emptyToNull = (value: string) => (value === "" ? null : value);

const optionalText = (max: number) =>
  z.string().trim().max(max, `Не длиннее ${max} символов`).transform(emptyToNull);

function isRealDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

// Missing fields count as empty: a form without JavaScript still sends them, other callers may not
const cadenceShape = {
  cadence: z
    .union([z.enum(CADENCES), z.literal("")], "Некорректная частота")
    .default("")
    .transform((value) => (value === "" ? null : value)),
  contactOn: z
    .string()
    .trim()
    .default("")
    .refine((value) => value === "" || isRealDate(value), "Некорректная дата"),
};

// "ё" and "е" are interchangeable: in search and in group names
export function foldYo(value: string) {
  return value.replace(/ё/g, "е").replace(/Ё/g, "Е");
}

// Same rule as the unique index groups_name_normalized_idx: case and "ё/е" do not differ
export function normalizeGroupName(name: string) {
  return foldYo(name.trim()).toLowerCase();
}

export const GROUP_NAME_MAX = 50;

const groupName = z
  .string()
  .trim()
  .min(1, "Укажи название")
  .max(GROUP_NAME_MAX, `Не длиннее ${GROUP_NAME_MAX} символов`);

export const groupNameSchema = z.object({ name: groupName });

// Groups ticked in the contact form plus an optional new group; unknown ids are dropped by the server
const contactGroupsShape = {
  groupIds: z
    .array(z.uuid("Некорректная группа"))
    .default([])
    .transform((ids) => [...new Set(ids)]),
  newGroup: z
    .string()
    .trim()
    .max(GROUP_NAME_MAX, `Не длиннее ${GROUP_NAME_MAX} символов`)
    .default("")
    .transform(emptyToNull),
};

type CadenceFields = { cadence: Cadence | null; contactOn: string };

// savedContactOn is the date already stored for the contact (null when creating): it may stay
// even if it has passed, otherwise an overdue date could not be carried through editing a phone
function checkCadence(savedContactOn: string | null, today: string | undefined) {
  return (value: CadenceFields, ctx: z.RefinementCtx) => {
    if (value.cadence !== "date") return;
    if (value.contactOn === "") {
      ctx.addIssue({ code: "custom", path: ["contactOn"], message: "Укажи дату" });
    } else if (
      isRealDate(value.contactOn) && // a malformed date is already reported by the field itself
      value.contactOn !== savedContactOn &&
      value.contactOn < (today ?? toDateString(new Date()))
    ) {
      ctx.addIssue({ code: "custom", path: ["contactOn"], message: "Дата уже прошла" });
    }
  };
}

// A period and a specific date exclude each other: the date is kept only for "date"
function dropStrayDate<T extends CadenceFields>(value: T) {
  return { ...value, contactOn: value.cadence === "date" ? value.contactOn : null };
}

// `today` is for tests; by default it is the current day in the app time zone
export function contactSchemaFor(savedContactOn: string | null, today?: string) {
  return z
    .object({
      name: z.string().trim().min(1, "Имя обязательно").max(200, "Не длиннее 200 символов"),
      about: optionalText(500),
      howWeMet: optionalText(500),
      phone: z
        .string()
        .trim()
        .max(50, "Не длиннее 50 символов")
        .regex(/^[0-9+()\-\s]*$/, "Только цифры, пробелы и символы + ( ) -")
        .transform(emptyToNull),
      email: z
        .string()
        .trim()
        .max(200, "Не длиннее 200 символов")
        .refine((value) => value === "" || z.email().safeParse(value).success, "Некорректная почта")
        .transform(emptyToNull),
      ...cadenceShape,
      ...contactGroupsShape,
    })
    .superRefine(checkCadence(savedContactOn, today))
    .transform(dropStrayDate);
}

// Frequency alone, for the form in the contact card
export function cadenceSchemaFor(savedContactOn: string | null, today?: string) {
  return z.object(cadenceShape).superRefine(checkCadence(savedContactOn, today)).transform(dropStrayDate);
}

// For creating a contact: there is no saved date yet
export const contactSchema = contactSchemaFor(null);

export type ContactInput = z.output<typeof contactSchema>;
// Text fields of the form; groups are sent as several values and handled separately
export type ContactField = Exclude<keyof z.input<typeof contactSchema>, keyof typeof contactGroupsShape>;

export const noteSchema = z.object({
  body: z.string().trim().min(1, "Заметка пустая").max(5000, "Не длиннее 5000 символов"),
});

export function firstErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}
