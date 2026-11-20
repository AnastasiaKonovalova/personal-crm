"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { requestLoginLinkAction, type LoginFormState } from "@/app/login/actions";
import { FieldError } from "@/components/field-error";
import { loginCardClasses } from "@/components/login-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// /login: the form and its states (mockups login*.html). «Ввести другую почту» starts over: with JavaScript
// the form is remounted, without it the link simply opens /login again
export function LoginPanel() {
  const [attempt, setAttempt] = useState(0);
  return <LoginForm key={attempt} onAnotherEmail={() => setAttempt((value) => value + 1)} />;
}

function LoginForm({ onAnotherEmail }: { onAnotherEmail: () => void }) {
  const [state, formAction, pending] = useActionState<LoginFormState, FormData>(
    requestLoginLinkAction,
    {},
  );

  if (state.sentTo) {
    return (
      <>
        <h1 className="font-display text-page-title font-semibold">Вход</h1>
        <section
          className={`${loginCardClasses} grid justify-items-center gap-controls`}
          role="status"
        >
          <span
            className="grid size-12 place-items-center rounded-round bg-teal-soft text-teal-deep"
            aria-hidden="true"
          >
            <Mail className="size-6" />
          </span>
          {/* one text node: the e2e tests read the sentence from the HTML */}
          <h2 className="font-display text-notes-title font-semibold [overflow-wrap:anywhere]">
            {`Ссылка для входа отправлена на ${state.sentTo}`}
          </h2>
          <p className="text-muted-foreground">
            Открой письмо и нажми «Войти». Ссылка работает 15 минут.
          </p>
          <Button asChild variant="ghost">
            <Link
              href="/login"
              onClick={(event) => {
                event.preventDefault();
                onAnotherEmail();
              }}
            >
              Ввести другую почту
            </Link>
          </Button>
        </section>
      </>
    );
  }

  return (
    <>
      <div>
        <h1 className="font-display text-page-title font-semibold">Вход</h1>
        <p className="mt-3.5 text-body-lg text-balance text-muted-foreground">
          Введи почту: пришлём ссылку для входа. Пароль не нужен.
        </p>
      </div>

      <form action={formAction} className={`${loginCardClasses} grid gap-heading`} noValidate>
        {/* the label and the error stay at the field edge, the rest of the screen is centered (decision 32) */}
        <div className="grid gap-2 text-left">
          <Label htmlFor="email">Почта</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="anna@example.com"
            defaultValue={state.email ?? ""}
            aria-invalid={state.invalid ? true : undefined}
            aria-describedby={state.error ? "email-error" : undefined}
            autoFocus
          />
          {state.error && (
            // the limit message is not about the field: the field keeps its normal look (decision 33)
            <FieldError id="email-error" role={state.invalid ? undefined : "alert"}>
              {state.error}
            </FieldError>
          )}
        </div>
        <div className="flex justify-center">
          <Button type="submit" disabled={pending}>
            {pending ? "Отправляю…" : "Получить ссылку"}
          </Button>
        </div>
      </form>
    </>
  );
}
