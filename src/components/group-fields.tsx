import { Check } from "lucide-react";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type GroupFieldsProps = {
  groups: { id: string; name: string }[];
  defaultGroupIds: string[];
  defaultNewGroup: string;
  errors?: { groupIds?: string; newGroup?: string };
};

// Group ticks and «Новая группа» in the contact form (mockup design/contact-new-groups.html).
// Native checkboxes in pill labels, so the form works without JavaScript; checked = accent-soft
// with an accent border and a check icon (meaning not by colour alone, decision 24)
export function GroupFields({
  groups,
  defaultGroupIds,
  defaultNewGroup,
  errors,
}: GroupFieldsProps) {
  const ticked = new Set(defaultGroupIds);

  return (
    <>
      {groups.length > 0 && (
        <fieldset className="grid min-w-0 gap-2">
          <legend className="mb-2 font-sans text-nav leading-none font-semibold text-ink">
            Группы
          </legend>
          <div className="flex min-w-0 flex-wrap gap-tag">
            {groups.map((group) => (
              <label
                key={group.id}
                className="group/pick relative inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-pill border border-line bg-surface px-3.5 py-1.5 text-nav font-semibold text-ink transition-colors duration-200 hover:border-teal-deep has-checked:border-primary has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-ring has-focus-visible:outline-solid"
              >
                <input
                  type="checkbox"
                  name="groupIds"
                  value={group.id}
                  defaultChecked={ticked.has(group.id)}
                  className="pointer-events-none absolute opacity-0"
                />
                <Check
                  aria-hidden="true"
                  className="hidden size-4 shrink-0 group-has-checked/pick:block"
                />
                <span className="truncate" title={group.name}>
                  {group.name}
                </span>
              </label>
            ))}
          </div>
          {errors?.groupIds && <FieldError>{errors.groupIds}</FieldError>}
        </fieldset>
      )}
      <div className="grid gap-2">
        <Label htmlFor="newGroup">Новая группа</Label>
        <Input
          id="newGroup"
          name="newGroup"
          defaultValue={defaultNewGroup}
          aria-invalid={errors?.newGroup ? true : undefined}
          aria-describedby={errors?.newGroup ? "newGroup-error newGroup-hint" : "newGroup-hint"}
        />
        {errors?.newGroup && <FieldError id="newGroup-error">{errors.newGroup}</FieldError>}
        <p id="newGroup-hint" className="text-caption text-muted-foreground">
          Если такая группа уже есть, контакт попадёт в неё.
        </p>
      </div>
    </>
  );
}
