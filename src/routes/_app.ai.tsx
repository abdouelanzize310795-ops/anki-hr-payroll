import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles, Send, Zap, FileText, MessageSquare, Wand2, Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { askAnkibaAi } from "@/modules/ai/ai.functions";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/ai")({ component: AiPage });

const appRouteApi = getRouteApi("/_app");

const skills = [
  { icon: Wand2, t: "Guides", d: "Comment créer un ticket, pointer, demander un congé…" },
  { icon: Search, t: "Effectif", d: "Actifs, en congé, aperçu de l’équipe." },
  { icon: MessageSquare, t: "Congés", d: "Files manager / RH et absents du jour." },
  { icon: FileText, t: "Helpdesk", d: "Tickets ouverts et qui les traite." },
];

type Msg = { role: "user" | "assistant"; text: string };

function AiPage() {
  const { auth } = appRouteApi.useRouteContext();
  const admin = isPlatformAdmin(auth);
  const role = auth.profile?.role ?? "employee";
  const isEmployee = role === "employee";
  const companyId = admin ? undefined : auth.profile?.company_id ?? undefined;

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [hints, setHints] = useState(
    isEmployee
      ? [
          "Comment créer un ticket ?",
          "Comment pointer ?",
          "Comment demander un congé ?",
          "Mon pointage",
          "Mes congés",
        ]
      : [
          "Comment créer un ticket ?",
          "Comment pointer ?",
          "Comment demander un congé ?",
          "Effectif actif",
          "Tickets helpdesk ouverts",
        ],
  );
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: isEmployee
        ? "Bonjour — demandez « Comment créer un ticket ? » ou consultez votre pointage, congés, tickets et bulletin."
        : "Bonjour — guides pas-à-pas (« Comment… ») et données live (effectif, congés, présence, paie, helpdesk).",
    },
  ]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    try {
      const res = await askAnkibaAi({ data: { question: q, companyId } });
      setMessages((m) => [...m, { role: "assistant", text: res.answer }]);
      if (res.hints?.length) setHints(res.hints);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: err instanceof Error ? err.message : "Réponse impossible pour le moment.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const userTurns = messages.filter((m) => m.role === "user").length;

  return (
    <>
      <PageHeader
        badge="IA"
        title="Assistant AnkibaPay"
        description={
          isEmployee
            ? "Guides pas-à-pas + vos données (pointage, congés, tickets, bulletin)."
            : "Guides plateforme + données live RH / paie / helpdesk."
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Questions posées" value={String(userTurns)} icon={MessageSquare} accent="primary" />
        <StatCard label="Réponses" value={String(Math.max(0, messages.length - 1))} icon={FileText} accent="gold" />
        <StatCard label="Mode" value="Guides + live" icon={Zap} accent="success" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Poser une question">
            <div className="mb-4 max-h-[360px] space-y-3 overflow-y-auto rounded-2xl bg-muted/40 p-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-8 rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "mr-8 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  }
                >
                  {m.text.split("\n").map((line, lineIdx, lines) => (
                    <span key={lineIdx}>
                      {line.split("**").map((part, idx) =>
                        idx % 2 === 1 ? (
                          <strong key={idx}>{part}</strong>
                        ) : (
                          <span key={idx}>{part}</span>
                        ),
                      )}
                      {lineIdx < lines.length - 1 ? <br /> : null}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {hints.map((s) => (
                <Badge
                  key={s}
                  variant="outline"
                  className="cursor-pointer hover:border-primary hover:bg-primary-soft"
                  onClick={() => void ask(s)}
                >
                  {s}
                </Badge>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <Textarea
                placeholder="Ex. Comment créer un ticket ?"
                rows={2}
                className="resize-none"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
              />
              <Button
                size="icon"
                className="shrink-0"
                disabled={busy || input.trim().length < 2}
                onClick={() => void ask(input)}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Ce que je peux faire">
          <div className="space-y-3">
            {skills.map((s) => (
              <div
                key={s.t}
                className="flex items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{s.t}</div>
                  <div className="text-xs text-muted-foreground">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Guides intégrés + réponses calculées depuis Supabase.
          </p>
        </SectionCard>
      </div>
    </>
  );
}
