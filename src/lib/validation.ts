import { z } from "zod";

// Error messages are user-facing, hence in Russian

const emptyToNull = (value: string) => (value === "" ? null : value);

const optionalText = (max: number) =>
  z.string().trim().max(max, `Не длиннее ${max} символов`).transform(emptyToNull);

export const contactSchema = z.object({
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
});

export type ContactInput = z.output<typeof contactSchema>;
export type ContactField = keyof z.input<typeof contactSchema>;

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
