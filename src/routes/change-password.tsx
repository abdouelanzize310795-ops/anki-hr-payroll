import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AnkibaPayLogo } from "@/components/brand/AnkibaPayLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changePasswordFirstLogin,
  requireAuthSession,
} from "@/lib/auth/auth.functions";
import { brand } from "@/lib/brand";

const schema = z
  .object({
    newPassword: z.string().min(8, "Au moins 8 caractères"),
    confirmPassword: z.string().min(8, "Confirmation requise"),
  })
  .superRefine((val, ctx) => {
    if (val.newPassword !== val.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Les mots de passe ne correspondent pas",
        path: ["confirmPassword"],
      });
    }
  });

type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/change-password")({
  beforeLoad: async () => {
    const auth = await requireAuthSession();
    if (!auth.profile?.must_change_password) {
      throw redirect({ to: "/" });
    }
    return { auth };
  },
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const result = await changePasswordFirstLogin({ data: values });
    if (!result.ok) {
      setServerError(result.message);
      return;
    }
    await navigate({ to: "/" });
  });

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
          <AnkibaPayLogo variant="full" className="h-14 w-auto" />
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-reef">
            {brand.tagline}
          </p>
        </div>

        <div className="card-elevated rounded-2xl p-8">
          <h1 className="font-display text-2xl font-bold text-primary">
            Changez votre mot de passe
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pour sécuriser votre compte, choisissez un nouveau mot de passe avant
            d’accéder à l’application. Le mot de passe temporaire ne pourra plus
            être utilisé.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                autoFocus
                {...form.register("newPassword")}
              />
              {form.formState.errors.newPassword && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.newPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...form.register("confirmPassword")}
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

            {serverError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-gold text-gold-foreground hover:bg-gold/90"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting
                ? "Enregistrement…"
                : "Enregistrer et continuer"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
