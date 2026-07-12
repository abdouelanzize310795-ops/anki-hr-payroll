import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AnkibaPayLogo } from "@/components/brand/AnkibaPayLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthSession, signInWithPassword } from "@/lib/auth/auth.functions";
import { brand } from "@/lib/brand";

const schema = z.object({
  email: z.string().email("Adresse e-mail invalide"),
  password: z.string().min(8, "Au moins 8 caractères"),
});

type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const session = await getAuthSession();
    if (session) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const result = await signInWithPassword({ data: values });
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
          <h1 className="font-display text-2xl font-bold text-primary">Connexion</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accédez à votre espace RH et paie.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
                autoComplete="current-password"
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

            <Button
              type="submit"
              className="w-full bg-gold text-gold-foreground hover:bg-gold/90"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Connexion…" : "Se connecter"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link to="/signup" className="font-medium text-reef hover:underline">
              Créer un compte
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
