import { describe, expect, it } from "vitest";
import { contactSchema, noteSchema } from "@/lib/validation";

const emptyContact = { name: "", about: "", howWeMet: "", phone: "", email: "" };

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

describe("noteSchema", () => {
  it("rejects an empty note", () => {
    expect(noteSchema.safeParse({ body: "   " }).success).toBe(false);
  });

  it("keeps the note text trimmed", () => {
    expect(noteSchema.parse({ body: "  Созвонились  " }).body).toBe("Созвонились");
  });
});
