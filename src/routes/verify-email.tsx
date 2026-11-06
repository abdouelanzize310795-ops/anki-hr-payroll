import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AuthCard, AuthMessage } from "@/components/brand/AuthCard";
import { Button } from "@/components/ui/button";
import { confirmEmailWithToken } from "@/lib/auth/email-links.functions";

export const Route = createFileRoute("/verify-email")({
  validateSearch: z.object({ token: z.string().optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Confirmation de l’adresse — Mshahara" }] }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { token } = Route.useSearch();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setResult({ ok: false, message: "Ce lien est incomplet." });
      return;
    }
    confirmEmailWithToken({ data: { token } })
      .then(setResult)
      .catch(() => setResult({ ok: false, message: "Confirmation impossible pour le moment. Réessayez plus tard." }));
  }, [token]);

  return (
    <AuthCard title="Confirmation de l’adresse e-mail">
      {result ? <AuthMessage ok={result.ok}>{result.message}</AuthMessage> : <p className="text-sm">Vérification…</p>}
      <Button asChild className="mt-4 w-full bg-gold text-gold-foreground hover:bg-gold/90">
        <Link to="/login">Aller à la connexion</Link>
      </Button>
    </AuthCard>
  );
}
