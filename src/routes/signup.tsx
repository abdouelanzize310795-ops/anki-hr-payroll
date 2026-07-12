import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AnkibaPayLogo } from "@/components/brand/AnkibaPayLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthSession, signInWithPassword, signUpWithPassword } from "@/lib/auth/auth.functions";
import { brand } from "@/lib/brand";

const schema = z.object({
  fullName: z.string().min(2, "Indiquez votre nom complet").max(120),
  email: z.string().email("Adresse e-mail invalide"),
  password: z.string().min(8, "Au moins 8 caractères"),
});

type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/signup")({
  beforeLoad: async () => {
    const session = await getAuthSession();
    if (session) {
      throw redirect({ to: "/" });
    }
  },
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    setInfo(null);
    const result = await signUpWithPassword({ data: values });
    if (!result.ok) {
      setServerError(result.message);
      return;
    }

    if (result.needsEmailConfirmation) {
      setInfo("Compte créé. Vérifiez votre e-mail pour confirmer l’adresse, puis connectez-vous.");
      return;
    }

    const login = await signInWithPassword({
      data: { email: values.email, password: values.password },
    });
    if (!login.ok) {
      setInfo("Compte créé. Vous pouvez vous connecter.");
      await navigate({ to: "/login" });
      return;
    }
    await navigate({ to: "/onboarding" });
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 80% -10%, color-mix(in srgb, #0E4C56 30%, transparent), transparent), radial-gradient(ellipse 50% 40% at 10% 90%, color-mix(in srgb, #E8A93B 22%, transparent), transparent)",
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
          <h1 className="font-display text-2xl font-bold text-primary">Créer un compte</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Démarrez AnkibaPay pour votre entreprise.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nom complet</Label>
              <Input id="fullName" autoComplete="name" placeholder="Amina Youssouf" {...form.register("fullName")} />
              {form.formState.errors.fullName && (
                <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail professionnel</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="vous@entreprise.km"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </div>
            )}
            {info && (
              <div className="rounded-lg border border-reef/30 bg-reef/10 px-3 py-2 text-sm text-foreground">
                {info}
              </div>
            )}

            <Button type="submit" className="w-full bg-gold text-gold-foreground hover:bg-gold/90" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Création…" : "Créer mon compte"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Déjà inscrit ?{" "}
            <Link to="/login" className="font-medium text-reef hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
