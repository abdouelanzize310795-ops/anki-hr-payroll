import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthCard, AuthMessage } from "@/components/brand/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordWithToken } from "@/lib/auth/email-links.functions";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Nouveau mot de passe — Mshahara" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const mismatch = confirm.length > 0 && password !== confirm;

  if (!token) {
    return (
      <AuthCard title="Lien incomplet">
        <AuthMessage ok={false}>Ce lien est incomplet. Faites une nouvelle demande.</AuthMessage>
        <p className="mt-6 text-center text-sm">
          <Link to="/forgot-password" className="font-medium text-reef hover:underline">
            Mot de passe oublié
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Nouveau mot de passe" subtitle="Au moins 8 caractères. Vous serez déconnecté de tous vos appareils.">
      {result?.ok ? (
        <>
          <AuthMessage ok>{result.message}</AuthMessage>
          <Button asChild className="mt-4 w-full bg-gold text-gold-foreground hover:bg-gold/90">
            <Link to="/login">Se connecter</Link>
          </Button>
        </>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              setResult(await resetPasswordWithToken({ data: { token, password } }));
            } catch (err) {
              setResult({ ok: false, message: err instanceof Error ? err.message : "Modification impossible" });
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="password">Nouveau mot de passe</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmer le mot de passe</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch && <p className="text-xs text-destructive">Les deux mots de passe sont différents.</p>}
          </div>
          {result && <AuthMessage ok={false}>{result.message}</AuthMessage>}
          <Button
            type="submit"
            className="w-full bg-gold text-gold-foreground hover:bg-gold/90"
            disabled={busy || password.length < 8 || password !== confirm}
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
