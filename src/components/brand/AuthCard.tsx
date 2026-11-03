import type { ReactNode } from "react";
import { MshaharaLogo } from "@/components/brand/MshaharaLogo";
import { brand } from "@/lib/brand";

/** Centered card with the brand, shared by the password and e-mail link pages. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 20% -10%, color-mix(in srgb, #35A69A 35%, transparent), transparent), radial-gradient(ellipse 60% 40% at 90% 100%, color-mix(in srgb, #E8A93B 25%, transparent), transparent)",
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <MshaharaLogo variant="full" className="h-14 w-auto" />
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-reef">{brand.tagline}</p>
        </div>
        <div className="card-elevated rounded-2xl p-8">
          <h1 className="font-display text-2xl font-bold text-primary">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function AuthMessage({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        ok ? "border-reef/30 bg-reef/10 text-reef" : "border-destructive/30 bg-destructive/10 text-destructive"
      }`}
    >
      {children}
    </div>
  );
}
