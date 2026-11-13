import { describe, expect, it } from "vitest";
import {
  cadenceSchemaFor,
  contactSchema,
  contactSchemaFor,
  groupNameSchema,
  noteSchema,
  normalizeGroupName,
} from "@/lib/validation";

const emptyContact = { name: "", about: "", howWeMet: "", phone: "", email: "" };

const TODAY = "2026-10-30";

describe("contactSchema", () => {
  it("requires a name", () => {
    const result = contactSchema.safeParse(emptyContact);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["name"]);
  });

  it("trims values and turns empty optional fields into null", () => {
    const result = contactSchema.parse({
      ...emptyContact,
      name: "  Анна Смирнова  ",
      about: "   ",
    });
    expect(result).toEqual({
      name: "Анна Смирнова",
      about: null,
      howWeMet: null,
      phone: null,
      email: null,
      cadence: null,
      contactOn: null,
      groupIds: [],
      newGroup: null,
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
  const errorsOf = (result: {
    success: boolean;
    error?: { issues: { path: PropertyKey[]; message: string }[] };
  }) =>
    Object.fromEntries(
      (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message]),
    );

  it("saves a contact without a cadence as not set", () => {
    const result = contactSchema.parse(named);
    expect(result.cadence).toBeNull();
    expect(result.contactOn).toBeNull();
  });

  it("accepts every period and drops a stray date", () => {
    const result = contactSchemaFor(null, TODAY).parse({
      ...named,
      cadence: "month",
      contactOn: "2026-12-01",
    });
    expect(result.cadence).toBe("month");
    expect(result.contactOn).toBeNull();
  });

  it("rejects an unknown cadence", () => {
    const result = contactSchemaFor(null, TODAY).safeParse({ ...named, cadence: "daily" });
    expect(errorsOf(result)).toEqual({ cadence: "Некорректная частота" });
  });

  it("requires a date for a specific date", () => {
    const result = contactSchemaFor(null, TODAY).safeParse({
      ...named,
      cadence: "date",
      contactOn: "",
    });
    expect(errorsOf(result)).toEqual({ contactOn: "Укажи дату" });
  });

  it("rejects a malformed or impossible date", () => {
    for (const contactOn of ["15.11.2026", "2026-02-30"]) {
      const result = contactSchemaFor(null, TODAY).safeParse({
        ...named,
        cadence: "date",
        contactOn,
      });
      expect(errorsOf(result)).toEqual({ contactOn: "Некорректная дата" });
    }
  });

  it("rejects a past date when creating", () => {
    const result = contactSchemaFor(null, TODAY).safeParse({
      ...named,
      cadence: "date",
      contactOn: "2026-10-29",
    });
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
    const result = contactSchemaFor("2026-10-25", TODAY).safeParse({
      ...named,
      cadence: "date",
      contactOn: "2026-10-27",
    });
    expect(errorsOf(result)).toEqual({ contactOn: "Дата уже прошла" });
  });

  it("validates the frequency form of the card the same way", () => {
    const schema = cadenceSchemaFor("2026-10-25", TODAY);
    expect(schema.parse({ cadence: "date", contactOn: "2026-10-25" })).toEqual({
      cadence: "date",
      contactOn: "2026-10-25",
    });
    expect(schema.parse({ cadence: "week", contactOn: "2026-10-25" })).toEqual({
      cadence: "week",
      contactOn: null,
    });
    expect(errorsOf(schema.safeParse({ cadence: "date", contactOn: "2026-10-27" }))).toEqual({
      contactOn: "Дата уже прошла",
    });
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

const GROUP_A = "7d4f1c2e-8a3b-4c5d-9e6f-0a1b2c3d4e5f";
const GROUP_B = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("groupNameSchema", () => {
  const errorOf = (name: string) => groupNameSchema.safeParse({ name }).error?.issues[0]?.message;

  it("rejects an empty name (scenario «Пустое имя»)", () => {
    expect(errorOf("")).toBe("Укажи название");
    expect(errorOf("   ")).toBe("Укажи название");
  });

  it("rejects a name longer than 50 characters (scenario «Слишком длинное имя»)", () => {
    expect(errorOf("я".repeat(51))).toBe("Не длиннее 50 символов");
  });

  it("accepts a name of exactly 50 characters after trimming", () => {
    expect(groupNameSchema.parse({ name: `  ${"я".repeat(50)}  ` }).name).toBe("я".repeat(50));
  });
});

describe("normalizeGroupName", () => {
  it("treats «Ёлка» and «елка» as one name", () => {
    expect(normalizeGroupName("Ёлка")).toBe(normalizeGroupName("елка"));
  });

  it("ignores case and surrounding spaces", () => {
    expect(normalizeGroupName("  Друзья ")).toBe(normalizeGroupName("друзья"));
  });

  it("keeps different names different", () => {
    expect(normalizeGroupName("Теннис")).not.toBe(normalizeGroupName("Теннис по субботам"));
  });
});

describe("contact groups in the contact form", () => {
  const named = { ...emptyContact, name: "Анна" };

  it("defaults to no groups and no new group", () => {
    const result = contactSchema.parse(named);
    expect(result.groupIds).toEqual([]);
    expect(result.newGroup).toBeNull();
  });

  it("drops duplicate group ids", () => {
    const result = contactSchema.parse({ ...named, groupIds: [GROUP_A, GROUP_B, GROUP_A] });
    expect(result.groupIds).toEqual([GROUP_A, GROUP_B]);
  });

  it("rejects a malformed group id", () => {
    const result = contactSchema.safeParse({ ...named, groupIds: ["not-a-uuid"] });
    expect(result.error?.issues[0]?.path[0]).toBe("groupIds");
  });

  it("trims the new group name and treats spaces as no new group", () => {
    expect(contactSchema.parse({ ...named, newGroup: "  Аналитики " }).newGroup).toBe("Аналитики");
    expect(contactSchema.parse({ ...named, newGroup: "   " }).newGroup).toBeNull();
  });

  it("rejects a new group name longer than 50 characters (scenario «Ошибка имени новой группы»)", () => {
    const result = contactSchema.safeParse({ ...named, newGroup: "я".repeat(51) });
    expect(result.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
      ["newGroup", "Не длиннее 50 символов"],
    ]);
  });

  it("reports the contact name error alongside the new group (scenario «Ошибка формы не теряет группы»)", () => {
    const result = contactSchema.safeParse({
      ...emptyContact,
      groupIds: [GROUP_A],
      newGroup: "Аналитики",
    });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(["name"]);
  });
});
