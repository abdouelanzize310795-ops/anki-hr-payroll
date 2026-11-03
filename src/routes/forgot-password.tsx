import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthCard, AuthMessage } from "@/components/brand/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/auth/email-links.functions";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Mot de passe oublié — Mshahara" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <AuthCard
      title="Mot de passe oublié"
      subtitle="Indiquez l’e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe."
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            setResult(await requestPasswordReset({ data: { email } }));
          } catch {
            setResult({ ok: false, message: "Envoi impossible pour le moment. Réessayez plus tard." });
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="vous@entreprise.km"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {result && <AuthMessage ok={result.ok}>{result.message}</AuthMessage>}
        <Button type="submit" className="w-full bg-gold text-gold-foreground hover:bg-gold/90" disabled={busy || !email}>
          {busy ? "Envoi…" : "Recevoir le lien"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-reef hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </AuthCard>
  );
}
