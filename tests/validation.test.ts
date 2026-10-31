import { describe, expect, it } from "vitest";
import { cadenceSchemaFor, contactSchema, contactSchemaFor, noteSchema } from "@/lib/validation";

const emptyContact = { name: "", about: "", howWeMet: "", phone: "", email: "" };

const TODAY = "2026-10-30";

describe("contactSchema", () => {
  it("requires a name", () => {
    const result = contactSchema.safeParse(emptyContact);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["name"]);
  });

  it("trims values and turns empty optional fields into null", () => {
    const result = contactSchema.parse({ ...emptyContact, name: "  Анна Смирнова  ", about: "   " });
    expect(result).toEqual({
      name: "Анна Смирнова",
      about: null,
      howWeMet: null,
      phone: null,
      email: null,
      cadence: null,
      contactOn: null,
    });
  });

  it("rejects a malformed email and phone", () => {
    const result = contactSchema.safeParse({
      ...emptyContact,
      name: "Анна",
      email: "anna@",
      phone: "позвонить",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(["email", "phone"]);
  });

  it("accepts a filled contact", () => {
    const result = contactSchema.parse({
      name: "Анна Смирнова",
      about: "Дизайнер",
      howWeMet: "Курсы",
      phone: "+7 (000) 123-45-67",
      email: "anna@example.com",
    });
    expect(result.email).toBe("anna@example.com");
    expect(result.phone).toBe("+7 (000) 123-45-67");
  });
});

describe("contact cadence", () => {
  const named = { ...emptyContact, name: "Анна" };
  const errorsOf = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
    Object.fromEntries((result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message]));

  it("saves a contact without a cadence as not set", () => {
    const result = contactSchema.parse(named);
    expect(result.cadence).toBeNull();
    expect(result.contactOn).toBeNull();
  });

  it("accepts every period and drops a stray date", () => {
    const result = contactSchemaFor(null, TODAY).parse({ ...named, cadence: "month", contactOn: "2026-12-01" });
    expect(result.cadence).toBe("month");
    expect(result.contactOn).toBeNull();
  });

  it("rejects an unknown cadence", () => {
    const result = contactSchemaFor(null, TODAY).safeParse({ ...named, cadence: "daily" });
    expect(errorsOf(result)).toEqual({ cadence: "Некорректная частота" });
  });

  it("requires a date for a specific date", () => {
    const result = contactSchemaFor(null, TODAY).safeParse({ ...named, cadence: "date", contactOn: "" });
    expect(errorsOf(result)).toEqual({ contactOn: "Укажи дату" });
  });

  it("rejects a malformed or impossible date", () => {
    for (const contactOn of ["15.11.2026", "2026-02-30"]) {
      const result = contactSchemaFor(null, TODAY).safeParse({ ...named, cadence: "date", contactOn });
      expect(errorsOf(result)).toEqual({ contactOn: "Некорректная дата" });
    }
  });

  it("rejects a past date when creating", () => {
    const result = contactSchemaFor(null, TODAY).safeParse({ ...named, cadence: "date", contactOn: "2026-10-29" });
    expect(errorsOf(result)).toEqual({ contactOn: "Дата уже прошла" });
  });

  it("accepts today and a future date", () => {
    for (const contactOn of [TODAY, "2026-12-15"]) {
      const result = contactSchemaFor(null, TODAY).parse({ ...named, cadence: "date", contactOn });
      expect(result.contactOn).toBe(contactOn);
    }
  });

  it("lets the saved past date pass when other fields are edited", () => {
    const result = contactSchemaFor("2026-10-25", TODAY).parse({
      ...named,
      phone: "+7 (000) 123-45-67",
      cadence: "date",
      contactOn: "2026-10-25",
    });
    expect(result.contactOn).toBe("2026-10-25");
  });

  it("rejects replacing the saved past date with another past date", () => {
    const result = contactSchemaFor("2026-10-25", TODAY).safeParse({ ...named, cadence: "date", contactOn: "2026-10-27" });
    expect(errorsOf(result)).toEqual({ contactOn: "Дата уже прошла" });
  });

  it("validates the frequency form of the card the same way", () => {
    const schema = cadenceSchemaFor("2026-10-25", TODAY);
    expect(schema.parse({ cadence: "date", contactOn: "2026-10-25" })).toEqual({ cadence: "date", contactOn: "2026-10-25" });
    expect(schema.parse({ cadence: "week", contactOn: "2026-10-25" })).toEqual({ cadence: "week", contactOn: null });
    expect(errorsOf(schema.safeParse({ cadence: "date", contactOn: "2026-10-27" }))).toEqual({ contactOn: "Дата уже прошла" });
  });
});

describe("noteSchema", () => {
  it("rejects an empty note", () => {
    expect(noteSchema.safeParse({ body: "   " }).success).toBe(false);
  });

  it("keeps the note text trimmed", () => {
    expect(noteSchema.parse({ body: "  Созвонились  " }).body).toBe("Созвонились");
  });
});
