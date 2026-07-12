import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Msg = { role: "user" | "ai"; text: string };

const suggestions = [
  "Draft an offer letter for a Senior Developer in Lagos",
  "Summarize this month's payroll variance",
  "Who is on leave next week?",
  "Generate a Q3 headcount report",
];

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "ai", text: "Hi Amina 👋 I'm your ANKIBAPAY AI. Ask me anything about payroll, contracts, or your team." },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 9999, behavior: "smooth" }); }, [msgs, open]);

  const send = (text: string) => {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setTimeout(() => {
      setMsgs((m) => [...m, { role: "ai", text: "Here's a draft based on your request. (Connect Lovable AI to activate live responses.)" }]);
    }, 700);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open AI assistant"
        className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-2xl brand-gradient shadow-glow transition-transform hover:scale-105 active:scale-95"
      >
        <Sparkles className="h-6 w-6 text-primary-foreground" />
      </button>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-border bg-card shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg brand-gradient">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <div className="font-display text-sm font-semibold">ANKIBAPAY AI</div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> Online
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                    : "max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm text-foreground"
                }>{m.text}</div>
              </div>
            ))}
            {msgs.length <= 1 && (
              <div className="pt-2">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Zap className="h-3 w-3" /> SUGGESTED</div>
                <div className="space-y-1.5">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-primary hover:bg-primary-soft">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Ask ANKIBAPAY AI…"
                rows={1}
                className="min-h-9 resize-none text-sm"
              />
              <Button size="icon" onClick={() => send(input)} className="shrink-0"><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
