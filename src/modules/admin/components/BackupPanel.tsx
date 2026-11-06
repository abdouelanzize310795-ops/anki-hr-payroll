import { useEffect, useRef, useState } from "react";
import { Archive, Download, RotateCcw, Upload } from "lucide-react";
import { SectionCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BackupFile = { name: string; size: number; created_at: string; kind: "manual" | "auto" | "before-restore" };

const KIND_LABEL: Record<BackupFile["kind"], string> = {
  manual: "Manuelle",
  auto: "Automatique",
  "before-restore": "Avant restauration",
};

const ADMIN_HEADERS = { "x-mshahara-admin": "1" };

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(body.message ?? `Erreur ${res.status}`));
  return body;
}

/** Full-system backup (database + uploaded files) and restore, platform admin only. */
export function BackupPanel() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Restore confirmation: a stored backup (name) or an uploaded file.
  const [pending, setPending] = useState<{ name?: string; file?: File } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const body = await readJson(await fetch("/api/admin/backups", { credentials: "same-origin" }));
      setBackups((body.backups as BackupFile[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setBusy("Sauvegarde en cours…");
    setError(null);
    setNotice(null);
    try {
      const body = await readJson(
        await fetch("/api/admin/backups", { method: "POST", headers: ADMIN_HEADERS, credentials: "same-origin" }),
      );
      const b = body.backup as BackupFile;
      setNotice(`Sauvegarde créée (${formatSize(b.size)}). Téléchargez-la pour la garder hors du serveur.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sauvegarde impossible");
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!pending) return;
    setBusy("Restauration en cours… ne fermez pas la page.");
    setError(null);
    setNotice(null);
    try {
      const query = pending.name ? `?name=${encodeURIComponent(pending.name)}` : "";
      const body = await readJson(
        await fetch(`/api/admin/backups/restore${query}`, {
          method: "POST",
          credentials: "same-origin",
          headers: { ...ADMIN_HEADERS, "x-admin-password": password, "content-type": "application/zip" },
          body: pending.file ?? null,
        }),
      );
      setPending(null);
      setNotice(
        `Restauration terminée. L’état précédent a été sauvegardé (${String(body.safety)}). Vous allez être reconnecté.`,
      );
      // Sessions come from the backup too: reload so the app starts from the restored state.
      setTimeout(() => window.location.assign("/login"), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restauration impossible");
    } finally {
      setBusy(null);
      setPassword("");
      setConfirmText("");
    }
  };

  const latest = backups[0];

  return (
    <SectionCard
      title="Sauvegarde et restauration"
      description="Toute la plateforme dans un fichier ZIP : base de données (entreprises, comptes, paie, pointages, congés…) et fichiers envoyés."
      action={
        <Button size="sm" onClick={() => void create()} disabled={Boolean(busy)}>
          <Archive className="mr-1.5 h-4 w-4" />
          Sauvegarder maintenant
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Une sauvegarde automatique est faite chaque jour (les 7 dernières sont gardées).
          {latest ? ` Dernière : ${formatDate(latest.created_at)}.` : " Aucune sauvegarde pour l’instant."}
        </p>

        {busy && <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">{busy}</p>}
        {notice && <p className="rounded-md bg-reef/10 px-3 py-2 text-sm text-reef">{notice}</p>}
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {backups.length > 0 && (
          <div className="divide-y rounded-lg border">
            {backups.map((b) => (
              <div key={b.name} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{formatDate(b.created_at)}</p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABEL[b.kind]} · {formatSize(b.size)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/admin/backups/${encodeURIComponent(b.name)}`} download>
                      <Download className="mr-1.5 h-4 w-4" />
                      Télécharger
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(busy)}
                    onClick={() => setPending({ name: b.name })}
                  >
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                    Restaurer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPending({ file });
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" />
            Restaurer depuis un fichier ZIP
          </Button>
        </div>
      </div>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restaurer la plateforme ?</DialogTitle>
            <DialogDescription>
              Toutes les données actuelles (entreprises, comptes, paie, pointages, fichiers) seront remplacées par
              celles de la sauvegarde{" "}
              <strong>{pending?.file ? pending.file.name : pending?.name}</strong>. Ce qui a été saisi depuis sera
              perdu. L’état actuel est sauvegardé automatiquement avant, pour pouvoir revenir en arrière.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="restore-password">Votre mot de passe administrateur</Label>
              <Input
                id="restore-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="restore-confirm">Tapez RESTAURER pour confirmer</Label>
              <Input id="restore-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={Boolean(busy)} onClick={() => setPending(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={Boolean(busy) || !password || confirmText.trim().toUpperCase() !== "RESTAURER"}
              onClick={() => void restore()}
            >
              {busy ? "Restauration…" : "Restaurer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
