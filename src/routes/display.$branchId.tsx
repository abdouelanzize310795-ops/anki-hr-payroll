import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { z } from "zod";
import { MshaharaLogo } from "@/components/brand/MshaharaLogo";

/**
 * Full-screen page shown on the screen installed in a site: a signed QR code
 * that rotates every few seconds. Opened from "Présences → Sites & QR".
 */
export const Route = createFileRoute("/display/$branchId")({
  validateSearch: z.object({ key: z.string().optional() }),
  component: DisplayPage,
});

type TokenPayload = {
  token: string;
  expires_in: number;
  rotation_seconds: number;
  branch_name: string;
  company_name: string;
};

function DisplayPage() {
  const { branchId } = Route.useParams();
  const { key } = Route.useSearch();
  const [payload, setPayload] = useState<TokenPayload | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [remaining, setRemaining] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchToken() {
      try {
        const res = await fetch(`/api/display/${branchId}/token?key=${encodeURIComponent(key ?? "")}`, {
          cache: "no-store",
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.message ?? "Écran non autorisé");
          setPayload(null);
          timer.current = setTimeout(fetchToken, 30_000);
          return;
        }
        setError(null);
        setOffline(false);
        setPayload(body as TokenPayload);
        setQr(await QRCode.toDataURL(body.token, { margin: 1, width: 640, errorCorrectionLevel: "M" }));
        setRemaining(body.expires_in);
        timer.current = setTimeout(fetchToken, Math.max(1, body.expires_in) * 1000 + 150);
      } catch {
        if (cancelled) return;
        // Never leave a stale code on screen when the network is down.
        setOffline(true);
        setQr(null);
        timer.current = setTimeout(fetchToken, 5_000);
      }
    }

    void fetchToken();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [branchId, key]);

  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const rotation = payload?.rotation_seconds ?? 15;
  const progress = payload ? (remaining / rotation) * 100 : 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-primary px-6 py-8 text-primary-foreground">
      <header className="flex w-full max-w-5xl items-center justify-between">
        <div className="rounded-xl bg-background px-4 py-2">
          <MshaharaLogo variant="full" className="h-10 w-auto" />
        </div>
        <p className="font-display text-4xl font-bold tabular-nums md:text-5xl">
          {now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </p>
      </header>

      <main className="flex flex-col items-center gap-6 text-center">
        {payload ? (
          <div>
            <p className="font-mono text-sm uppercase tracking-[0.3em] text-gold">{payload.company_name}</p>
            <h1 className="mt-2 font-display text-3xl font-bold md:text-5xl">{payload.branch_name}</h1>
          </div>
        ) : null}

        {error ? (
          <div className="max-w-md rounded-2xl bg-background/10 p-8">
            <p className="font-display text-2xl font-bold">Écran non autorisé</p>
            <p className="mt-2 text-primary-foreground/80">{error}</p>
          </div>
        ) : offline ? (
          <div className="max-w-md rounded-2xl bg-destructive/90 p-8">
            <p className="font-display text-2xl font-bold">Connexion perdue</p>
            <p className="mt-2">Le QR code réapparaîtra dès le retour de la connexion. Reconnexion…</p>
          </div>
        ) : qr ? (
          <>
            <div className="rounded-3xl bg-white p-5 shadow-2xl">
              <img src={qr} alt="QR code de pointage" className="h-[min(60vh,560px)] w-[min(60vh,560px)]" />
            </div>
            <div className="w-full max-w-sm">
              <div className="h-2 overflow-hidden rounded-full bg-background/20">
                <div className="h-full bg-gold transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-sm text-primary-foreground/80">
                Nouveau code dans {remaining} s · Ouvrez l’app Mshahara et touchez « Scanner pour pointer »
              </p>
            </div>
          </>
        ) : (
          <p className="text-primary-foreground/80">Chargement du code…</p>
        )}
      </main>

      <footer className="text-xs text-primary-foreground/60">
        Le code change automatiquement : une photo du code ne permet pas de pointer à distance.
      </footer>
    </div>
  );
}
