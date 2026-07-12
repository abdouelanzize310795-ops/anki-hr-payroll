import { useState, useRef, useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getRouteApi } from "@tanstack/react-router";
import { askAnkibaAi } from "@/modules/ai/ai.functions";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

type Msg = { role: "user" | "ai"; text: string };

const suggestions = [
  "Effectif actif",
  "Résumé de la paie",
  "Qui est en congé ?",
  "État des contrats",
];

const appRouteApi = getRouteApi("/_app");

function renderText(text: string) {
  return text.split("**").map((part, idx) =>
    idx % 2 === 1 ? <strong key={idx}>{part}</strong> : <span key={idx}>{part}</span>,
  );
}

export function AiAssistant() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { auth } = appRouteApi.useRouteContext();
  const admin = isPlatformAdmin(auth);
  const companyId = admin ? undefined : auth.profile?.company_id ?? undefined;
  const firstName =
    auth.profile?.full_name?.trim().split(/\s+/)[0] ??
    auth.email.split("@")[0] ??
    "là";

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "ai",
      text: `Bonjour ${firstName}. Je réponds à partir de vos données AnkibaPay (effectif, congés, paie, contrats). Les actions sensibles restent à votre validation.`,
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9999, behavior: "smooth" });
  }, [msgs, open]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    try {
      const res = await askAnkibaAi({ data: { question: q, companyId } });
      setMsgs((m) => [...m, { role: "ai", text: res.answer }]);
    } catch (err) {
      setMsgs((m) => [
        ...m,
        {
          role: "ai",
          text: err instanceof Error ? err.message : "Réponse impossible pour le moment.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  // Hidden on dedicated AI page to avoid duplicate UX
  if (pathname.startsWith("/ai")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir l’assistant IA"
        className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-2xl brand-gradient shadow-glow transition-transform hover:scale-105 active:scale-95"
      >
        <Sparkles className="h-6 w-6 text-primary-foreground" />
      </button>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[min(560px,70vh)] w-[min(380px,calc(100vw-2rem))] flex-col rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg brand-gradient">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <div className="font-display text-sm font-semibold">Assistant AnkibaPay</div>
                <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> Données live
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Fermer">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                      : "max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm text-foreground"
                  }
                >
                  {renderText(m.text)}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyse des données…
              </div>
            )}
            {msgs.length < 3 && !busy && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-reef hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Posez votre question…"
                className="min-h-[44px] max-h-28 resize-none"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
              />
              <Button
                size="icon"
                onClick={() => void send(input)}
                disabled={busy || input.trim().length < 2}
                aria-label="Envoyer"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
