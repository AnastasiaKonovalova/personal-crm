// Column of the sign-in screens (/login, /login/expired): one narrow column of 520px, everything centered
// (design/README.md, decision 32); the field label and its error stay at the field edge, see LoginForm.
// Same paddings as PageShell, which has no width this narrow
export function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto grid w-full max-w-[calc(520px+2*var(--gutter-fluid))] gap-heading px-gutter-fluid pt-[clamp(28px,4vw,56px)] pb-[clamp(50px,7vw,96px)] text-center">
      {children}
    </main>
  );
}

export const loginCardClasses =
  "rounded-card border border-line bg-surface p-[clamp(22px,2.6vw,30px)]";
