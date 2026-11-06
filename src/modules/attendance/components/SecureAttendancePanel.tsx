import { useCallback, useEffect, useState } from "react";
import {
  Check, Copy, Download, ExternalLink, LocateFixed, MapPin, QrCode, RefreshCw, Smartphone, X,
} from "lucide-react";
import { SectionCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  exportAttendanceCsv,
  getDisplayLink,
  getLiveBoard,
  listCorrections,
  listDevices,
  listRejections,
  listSites,
  listWorkPolicies,
  reviewCorrection,
  reviewDevice,
  rotateSiteQr,
  saveSite,
  saveWorkPolicy,
} from "@/modules/attendance/secure.functions";
import {
  REJECTION_LABEL,
  WEEKDAYS_FR,
  type AttendanceCorrection,
  type AttendanceRejection,
  type EmployeeDevice,
  type LiveBoard,
  type SiteSettings,
  type WorkPolicy,
} from "@/modules/attendance/secure.types";

const PERSON_STATUS: Record<string, { label: string; cls: string }> = {
  present: { label: "Présent", cls: "bg-success/10 text-success" },
  late: { label: "En retard", cls: "bg-gold/20 text-gold-foreground" },
  absent: { label: "Absent", cls: "bg-destructive/10 text-destructive" },
  on_leave: { label: "En congé", cls: "bg-reef/15 text-reef" },
  not_yet: { label: "Pas encore arrivé", cls: "bg-muted text-muted-foreground" },
};

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export function SecureAttendancePanel({ companyId }: { companyId: string }) {
  return (
    <SectionCard
      title="Pointage sécurisé"
      description="Présences en direct, corrections, téléphones autorisés, refus et réglages des sites."
    >
      <Tabs defaultValue="live">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="live">En direct</TabsTrigger>
          <TabsTrigger value="corrections">Corrections</TabsTrigger>
          <TabsTrigger value="devices">Téléphones</TabsTrigger>
          <TabsTrigger value="rejections">Refus</TabsTrigger>
          <TabsTrigger value="sites">Sites & QR</TabsTrigger>
          <TabsTrigger value="policies">Horaires</TabsTrigger>
        </TabsList>
        <TabsContent value="live"><LiveTab companyId={companyId} /></TabsContent>
        <TabsContent value="corrections"><CorrectionsTab companyId={companyId} /></TabsContent>
        <TabsContent value="devices"><DevicesTab companyId={companyId} /></TabsContent>
        <TabsContent value="rejections"><RejectionsTab companyId={companyId} /></TabsContent>
        <TabsContent value="sites"><SitesTab companyId={companyId} /></TabsContent>
        <TabsContent value="policies"><PoliciesTab companyId={companyId} /></TabsContent>
      </Tabs>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function LiveTab({ companyId }: { companyId: string }) {
  const [board, setBoard] = useState<LiveBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const res = await getLiveBoard({ data: { companyId } });
    if (res.ok) {
      setBoard(res.data);
      setError(null);
    } else setError(res.message);
  }, [companyId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function onExport() {
    setExporting(true);
    try {
      const res = await exportAttendanceCsv({ data: { companyId, from, to } });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = res.data.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  }

  const t = board?.totals;
  const tiles = t
    ? [
        { label: "Attendus", value: t.expected },
        { label: "Présents", value: t.present },
        { label: "En retard", value: t.late },
        { label: "Pas encore arrivés", value: t.not_yet },
        { label: "Absents", value: t.absent },
        { label: "En congé", value: t.on_leave },
        { label: "Sortie manquante", value: t.missing_checkout },
      ]
    : [];

  return (
    <div className="mt-4 space-y-5">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-lg border bg-card p-3">
            <p className="font-display text-2xl font-bold text-primary">{x.value}</p>
            <p className="text-xs text-muted-foreground">{x.label}</p>
          </div>
        ))}
      </div>

      {board && board.by_branch.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {board.by_branch.map((b) => (
            <span key={b.branch_id ?? "none"} className="rounded-md border px-3 py-1.5 text-xs">
              <MapPin className="mr-1 inline h-3 w-3" />
              {b.branch_name} : {b.present + b.late}/{b.expected} présents · {b.late} retard(s)
            </span>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employé</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Entrée</TableHead>
              <TableHead>Sortie</TableHead>
              <TableHead>Retard</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(board?.people ?? []).map((p) => {
              const s = PERSON_STATUS[p.status] ?? { label: p.status, cls: "bg-muted" };
              return (
                <TableRow key={p.employee_id}>
                  <TableCell>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.job_title ?? ""}</p>
                  </TableCell>
                  <TableCell><Badge label={s.label} cls={s.cls} /></TableCell>
                  <TableCell>{p.check_in ?? "—"}</TableCell>
                  <TableCell>
                    {p.check_out ?? (p.missing_checkout ? <span className="text-destructive">manquante</span> : "—")}
                  </TableCell>
                  <TableCell>{p.late_minutes ? `${p.late_minutes} min` : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.source === "qr" ? "QR + GPS" : p.source === "mobile" ? "GPS" : p.source ?? "—"}
                    {p.distance_m != null ? ` · ${Math.round(p.distance_m)} m` : ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Du</p>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Au</p>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" disabled={exporting || !from || !to} onClick={() => void onExport()}>
          <Download className="mr-1.5 h-4 w-4" />
          Exporter (Excel / CSV)
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CorrectionsTab({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<AttendanceCorrection[]>([]);
  const [status, setStatus] = useState<"pending" | "all">("pending");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listCorrections({ data: { companyId, status } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }, [companyId, status]);
  useEffect(() => void load(), [load]);

  async function review(id: string, action: "approve" | "reject") {
    const note = action === "reject" ? window.prompt("Motif du refus (facultatif)") ?? undefined : undefined;
    const res = await reviewCorrection({ data: { id, action, note } });
    if (!res.ok) setError(res.message);
    await load();
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={status === "pending" ? "default" : "outline"} onClick={() => setStatus("pending")}>
          En attente
        </Button>
        <Button size="sm" variant={status === "all" ? "default" : "outline"} onClick={() => setStatus("all")}>
          Toutes
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune demande de correction.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employé</TableHead>
              <TableHead>Jour</TableHead>
              <TableHead>Heures demandées</TableHead>
              <TableHead>Motif</TableHead>
              <TableHead className="text-right">Décision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.employee_name}</TableCell>
                <TableCell>{new Date(`${c.work_date}T12:00:00`).toLocaleDateString("fr-FR")}</TableCell>
                <TableCell>
                  {(c.requested_check_in ?? "—").slice(0, 5)} → {(c.requested_check_out ?? "—").slice(0, 5)}
                </TableCell>
                <TableCell className="max-w-xs text-sm">{c.reason}</TableCell>
                <TableCell className="text-right">
                  {c.status === "pending" ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => void review(c.id, "approve")}>
                        <Check className="mr-1 h-4 w-4" /> Valider
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void review(c.id, "reject")}>
                        <X className="mr-1 h-4 w-4" /> Refuser
                      </Button>
                    </div>
                  ) : (
                    <Badge
                      label={c.status === "approved" ? "Validée" : c.status === "rejected" ? "Refusée" : "Annulée"}
                      cls={c.status === "approved" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DevicesTab({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<EmployeeDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setRows(await listDevices({ data: { companyId } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }, [companyId]);
  useEffect(() => void load(), [load]);

  async function review(id: string, action: "approve" | "revoke") {
    const res = await reviewDevice({ data: { id, action } });
    if (!res.ok) setError(res.message);
    await load();
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Un seul téléphone autorisé par employé. Le premier est approuvé automatiquement ; approuver un nouveau
        téléphone retire l’ancien.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun téléphone enregistré pour l’instant.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employé</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Enregistré</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.employee_name}</TableCell>
                <TableCell>
                  <Smartphone className="mr-1 inline h-4 w-4 text-muted-foreground" />
                  {d.model ?? d.platform ?? "Inconnu"}
                </TableCell>
                <TableCell className="text-sm">{fmtDateTime(d.registered_at)}</TableCell>
                <TableCell>
                  <Badge
                    label={d.status === "approved" ? "Autorisé" : d.status === "pending" ? "En attente" : "Retiré"}
                    cls={
                      d.status === "approved"
                        ? "bg-success/10 text-success"
                        : d.status === "pending"
                          ? "bg-gold/20 text-gold-foreground"
                          : "bg-muted text-muted-foreground"
                    }
                  />
                </TableCell>
                <TableCell className="text-right">
                  {d.status !== "approved" ? (
                    <Button size="sm" onClick={() => void review(d.id, "approve")}>Autoriser</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void review(d.id, "revoke")}>Retirer</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function RejectionsTab({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<AttendanceRejection[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setRows(await listRejections({ data: { companyId, reason: reason || undefined, days: 30 } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }, [companyId, reason]);
  useEffect(() => void load(), [load]);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Tous les motifs</option>
          {Object.entries(REJECTION_LABEL).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          30 derniers jours. Beaucoup de refus « trop loin » à quelques mètres du rayon ? Augmentez le rayon du site.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun pointage refusé.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quand</TableHead>
              <TableHead>Employé</TableHead>
              <TableHead>Motif</TableHead>
              <TableHead>Distance</TableHead>
              <TableHead>Précision GPS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{fmtDateTime(r.attempted_at)}</TableCell>
                <TableCell className="font-medium">{r.employee_name}</TableCell>
                <TableCell title={r.message}>{REJECTION_LABEL[r.reason_code] ?? r.reason_code}</TableCell>
                <TableCell>{r.distance_m != null ? `${Math.round(r.distance_m)} m` : "—"}</TableCell>
                <TableCell>{r.accuracy_m != null ? `±${Math.round(r.accuracy_m)} m` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type SiteDraft = {
  id?: string;
  name: string;
  city: string;
  latitude: string;
  longitude: string;
  radiusM: number;
  maxAccuracyM: number;
  requireQr: boolean;
  qrRotationSeconds: number;
};

const emptySite: SiteDraft = {
  name: "", city: "", latitude: "", longitude: "", radiusM: 50, maxAccuracyM: 50, requireQr: false, qrRotationSeconds: 15,
};

function toDraft(s: SiteSettings): SiteDraft {
  return {
    id: s.id,
    name: s.name,
    city: s.city ?? "",
    latitude: s.latitude?.toString() ?? "",
    longitude: s.longitude?.toString() ?? "",
    radiusM: s.radius_m,
    maxAccuracyM: s.max_accuracy_m,
    requireQr: s.require_qr,
    qrRotationSeconds: s.qr_rotation_seconds,
  };
}

/** Averages ~10 browser GPS readings taken over ~30 s. */
function captureAveragePosition(onProgress: (n: number) => void): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Géolocalisation non disponible dans ce navigateur"));
      return;
    }
    const readings: GeolocationCoordinates[] = [];
    const finish = () => {
      navigator.geolocation.clearWatch(watch);
      clearTimeout(timer);
      if (readings.length === 0) {
        reject(new Error("Aucune position reçue. Autorisez la localisation et réessayez."));
        return;
      }
      const best = [...readings].sort((a, b) => a.accuracy - b.accuracy).slice(0, Math.max(3, Math.ceil(readings.length / 2)));
      resolve({
        lat: best.reduce((s, r) => s + r.latitude, 0) / best.length,
        lng: best.reduce((s, r) => s + r.longitude, 0) / best.length,
        accuracy: best.reduce((s, r) => s + r.accuracy, 0) / best.length,
      });
    };
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        readings.push(pos.coords);
        onProgress(readings.length);
        if (readings.length >= 10) finish();
      },
      (err) => {
        if (readings.length === 0) {
          navigator.geolocation.clearWatch(watch);
          clearTimeout(timer);
          reject(new Error(err.message || "Localisation refusée"));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    const timer = setTimeout(finish, 30_000);
  });
}

function SitesTab({ companyId }: { companyId: string }) {
  const [sites, setSites] = useState<SiteSettings[]>([]);
  const [draft, setDraft] = useState<SiteDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => setSites(await listSites({ data: { companyId } })), [companyId]);
  useEffect(() => void load(), [load]);

  async function onSave() {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    const lat = draft.latitude.trim() ? Number(draft.latitude.replace(",", ".")) : null;
    const lng = draft.longitude.trim() ? Number(draft.longitude.replace(",", ".")) : null;
    const res = await saveSite({
      data: {
        id: draft.id,
        companyId,
        name: draft.name,
        city: draft.city,
        latitude: lat,
        longitude: lng,
        radiusM: draft.radiusM,
        maxAccuracyM: draft.maxAccuracyM,
        requireQr: draft.requireQr,
        qrRotationSeconds: draft.qrRotationSeconds,
      },
    });
    setBusy(false);
    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    setDraft(null);
    await load();
  }

  async function onCapture() {
    setMessage(null);
    setCapturing(0);
    try {
      const pos = await captureAveragePosition((n) => setCapturing(n));
      setDraft((d) => (d ? { ...d, latitude: pos.lat.toFixed(6), longitude: pos.lng.toFixed(6) } : d));
      setMessage(`Position enregistrée (précision moyenne ±${Math.round(pos.accuracy)} m). Pensez à enregistrer.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Localisation impossible");
    } finally {
      setCapturing(null);
    }
  }

  async function openDisplay(id: string) {
    const res = await getDisplayLink({ data: { id } });
    if (res.ok) window.open(res.data.path, "_blank", "noopener");
    else setMessage(res.message);
  }

  async function copyDisplay(id: string) {
    const res = await getDisplayLink({ data: { id } });
    if (!res.ok) return setMessage(res.message);
    await navigator.clipboard.writeText(`${window.location.origin}${res.data.path}`);
    setMessage("Lien de l’écran QR copié. Ouvrez-le sur l’écran installé dans le site.");
  }

  async function onRotate(id: string) {
    if (!window.confirm("Régénérer la clé QR ? Les codes déjà affichés deviendront invalides.")) return;
    const res = await rotateSiteQr({ data: { id } });
    setMessage(res.ok ? "Clé QR régénérée." : res.message);
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Chaque site a une position GPS et un rayon : un employé ne peut pointer que s’il est dans le rayon. Avec
        « QR obligatoire », il doit aussi scanner le code affiché sur l’écran du site (il change toutes les 15 s).
      </p>
      {message ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        {sites.map((s) => (
          <div key={s.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-primary">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.latitude != null
                    ? `${s.latitude.toFixed(5)}, ${s.longitude?.toFixed(5)} · rayon ${s.radius_m} m · GPS ±${s.max_accuracy_m} m max`
                    : "Position non définie — pointage impossible sur ce site"}
                </p>
              </div>
              {s.require_qr ? <Badge label="QR obligatoire" cls="bg-primary/10 text-primary" /> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDraft(toDraft(s))}>Modifier</Button>
              {s.latitude != null ? (
                <Button size="sm" variant="ghost" asChild>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=19/${s.latitude}/${s.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MapPin className="mr-1 h-4 w-4" /> Carte
                  </a>
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => void openDisplay(s.id)}>
                <QrCode className="mr-1 h-4 w-4" /> Écran QR <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void copyDisplay(s.id)}>
                <Copy className="mr-1 h-4 w-4" /> Copier le lien
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void onRotate(s.id)}>
                <RefreshCw className="mr-1 h-4 w-4" /> Nouvelle clé
              </Button>
            </div>
          </div>
        ))}
      </div>

      {draft ? (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <p className="font-semibold">{draft.id ? `Modifier « ${draft.name} »` : "Nouveau site"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Nom du site
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="text-sm">
              Ville
              <Input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
            </label>
            <label className="text-sm">
              Latitude
              <Input value={draft.latitude} placeholder="-11.702200" onChange={(e) => setDraft({ ...draft, latitude: e.target.value })} />
            </label>
            <label className="text-sm">
              Longitude
              <Input value={draft.longitude} placeholder="43.255100" onChange={(e) => setDraft({ ...draft, longitude: e.target.value })} />
            </label>
            <label className="text-sm">
              Rayon autorisé (m)
              <Input type="number" min={5} max={2000} value={draft.radiusM}
                onChange={(e) => setDraft({ ...draft, radiusM: Number(e.target.value) })} />
            </label>
            <label className="text-sm">
              Précision GPS maximale (m)
              <Input type="number" min={5} max={500} value={draft.maxAccuracyM}
                onChange={(e) => setDraft({ ...draft, maxAccuracyM: Number(e.target.value) })} />
            </label>
            <label className="text-sm">
              Rotation du QR (secondes)
              <Input type="number" min={10} max={60} value={draft.qrRotationSeconds}
                onChange={(e) => setDraft({ ...draft, qrRotationSeconds: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={draft.requireQr} onCheckedChange={(v) => setDraft({ ...draft, requireQr: v })} />
              Scanner le QR du site est obligatoire
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={capturing !== null} onClick={() => void onCapture()}>
              <LocateFixed className="mr-1.5 h-4 w-4" />
              {capturing !== null ? `Mesure en cours… ${capturing}/10` : "Utiliser ma position actuelle"}
            </Button>
            <Button disabled={busy || draft.name.trim().length < 2} onClick={() => void onSave()}>Enregistrer</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>Annuler</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Astuce : faites la mesure en étant à l’intérieur du site, depuis un téléphone ou un ordinateur portable.
          </p>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setDraft({ ...emptySite })}>+ Ajouter un site</Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PoliciesTab({ companyId }: { companyId: string }) {
  const [policies, setPolicies] = useState<WorkPolicy[]>([]);
  const [draft, setDraft] = useState<WorkPolicy | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => setPolicies(await listWorkPolicies({ data: { companyId } })), [companyId]);
  useEffect(() => void load(), [load]);

  async function onSave() {
    if (!draft) return;
    const res = await saveWorkPolicy({
      data: {
        id: draft.id || undefined,
        companyId,
        name: draft.name,
        workDays: draft.work_days,
        startTime: draft.start_time,
        endTime: draft.end_time,
        graceMinutes: Number(draft.grace_minutes),
        earlyCheckinMinutes: Number(draft.early_checkin_minutes),
        checkoutExtensionMinutes: Number(draft.checkout_extension_minutes),
      },
    });
    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    setMessage(null);
    setDraft(null);
    await load();
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Les horaires déterminent les jours travaillés, l’heure à partir de laquelle un employé est « en retard », et
        la clôture automatique (absents, sorties manquantes). L’horaire par défaut s’applique à tous ; un service ou
        un employé peut avoir le sien.
      </p>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {policies.map((p) => (
          <div key={p.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-primary">{p.name}</p>
              {p.is_default ? <Badge label="Par défaut" cls="bg-primary/10 text-primary" /> : null}
            </div>
            <p className="mt-1 text-sm">
              {p.work_days.map((d) => WEEKDAYS_FR[d - 1]).join(", ")} · {p.start_time}–{p.end_time}
            </p>
            <p className="text-xs text-muted-foreground">
              Retard après {p.grace_minutes} min · entrée possible {p.early_checkin_minutes} min avant · sortie jusqu’à{" "}
              {p.checkout_extension_minutes} min après
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setDraft({ ...p })}>Modifier</Button>
          </div>
        ))}
      </div>

      {draft ? (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Nom
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <div className="text-sm">
              Jours travaillés
              <div className="mt-1 flex flex-wrap gap-1">
                {WEEKDAYS_FR.map((label, i) => {
                  const day = i + 1;
                  const on = draft.work_days.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          work_days: on ? draft.work_days.filter((d) => d !== day) : [...draft.work_days, day].sort(),
                        })
                      }
                      className={`rounded-md border px-2.5 py-1 text-xs ${on ? "bg-primary text-primary-foreground" : ""}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="text-sm">
              Début
              <Input type="time" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
            </label>
            <label className="text-sm">
              Fin
              <Input type="time" value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} />
            </label>
            <label className="text-sm">
              Tolérance avant retard (min)
              <Input type="number" value={draft.grace_minutes}
                onChange={(e) => setDraft({ ...draft, grace_minutes: Number(e.target.value) })} />
            </label>
            <label className="text-sm">
              Entrée possible avant le début (min)
              <Input type="number" value={draft.early_checkin_minutes}
                onChange={(e) => setDraft({ ...draft, early_checkin_minutes: Number(e.target.value) })} />
            </label>
            <label className="text-sm">
              Sortie possible après la fin (min)
              <Input type="number" value={draft.checkout_extension_minutes}
                onChange={(e) => setDraft({ ...draft, checkout_extension_minutes: Number(e.target.value) })} />
            </label>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void onSave()}>Enregistrer</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>Annuler</Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() =>
            setDraft({
              id: "",
              company_id: companyId,
              name: "Nouvel horaire",
              work_days: [1, 2, 3, 4, 5],
              start_time: "08:00",
              end_time: "17:00",
              grace_minutes: 15,
              early_checkin_minutes: 60,
              checkout_extension_minutes: 120,
              is_default: false,
            })
          }
        >
          + Ajouter un horaire
        </Button>
      )}
    </div>
  );
}
