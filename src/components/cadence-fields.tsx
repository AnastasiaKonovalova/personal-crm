"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FieldError } from "@/components/field-error";
import { Input, fieldClasses } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CADENCES, CADENCE_LABELS } from "@/lib/keep-in-touch";
import { cn } from "@/lib/utils";

// "Как часто связываться": native select as a pill, plus a date field for «Конкретная дата».
// Without JavaScript the date field is always visible (the server ignores it unless «Конкретная
// дата» is chosen); with JavaScript globals.css hides it while another option is selected.
// `children` go at the end of the row (the "Сохранить" button of the contact card).
export function CadenceFields({
  idPrefix = "",
  defaultCadence,
  defaultContactOn,
  errors,
  cardLabel,
  children,
}: {
  idPrefix?: string;
  defaultCadence: string;
  defaultContactOn: string;
  errors?: { cadence?: string; contactOn?: string };
  cardLabel?: boolean;
  children?: React.ReactNode;
}) {
  const [cadence, setCadence] = useState(defaultCadence);
  const cadenceId = `${idPrefix}cadence`;
  const dateId = `${idPrefix}contactOn`;

  return (
    <div className="grid gap-2">
      <Label
        htmlFor={cadenceId}
        // same label style as the card's data labels (design decision 9)
        className={cn(cardLabel && "font-display text-badge font-normal text-muted-foreground uppercase")}
      >
        Как часто связываться
      </Label>
      <div className="flex flex-wrap items-center gap-cta">
        <span className="relative min-w-0 max-w-80 flex-[1_1_220px]">
          <select
            id={cadenceId}
            name="cadence"
            defaultValue={defaultCadence}
            onChange={(event) => setCadence(event.target.value)}
            aria-invalid={errors?.cadence ? true : undefined}
            aria-describedby={errors?.cadence ? `${cadenceId}-error` : undefined}
            className={cn(fieldClasses, "cursor-pointer appearance-none pr-12")}
          >
            <option value="">Не задано</option>
            {CADENCES.map((value) => (
              <option key={value} value={value}>
                {CADENCE_LABELS[value]}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-[18px] size-5 -translate-y-1/2 text-muted-foreground"
          />
        </span>
        <div
          data-cadence-date=""
          data-visible={cadence === "date"}
          className="min-w-0 flex-[0_1_220px]"
        >
          <Label htmlFor={dateId} className="sr-only">
            Дата
          </Label>
          <Input
            id={dateId}
            name="contactOn"
            type="date"
            defaultValue={defaultContactOn}
            aria-invalid={errors?.contactOn ? true : undefined}
            aria-describedby={errors?.contactOn ? `${dateId}-error` : undefined}
          />
        </div>
        {children}
      </div>
      {errors?.cadence && <FieldError id={`${cadenceId}-error`}>{errors.cadence}</FieldError>}
      {errors?.contactOn && <FieldError id={`${dateId}-error`}>{errors.contactOn}</FieldError>}
    </div>
  );
}
