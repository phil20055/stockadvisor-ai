import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Send, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn, stripCite } from "@/lib/utils";
import type { ChatMessage, PortfolioAnalysis } from "@shared/schema";

const SUGGESTIONS = [
  "What's the bear case here?",
  "Why this target price?",
  "What would change your mind?",
  "Which call has the highest conviction?",
];

type Props = {
  analysis: PortfolioAnalysis;
};

export function AnalysisChat({ analysis }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatMutation = useMutation({
    mutationFn: async (history: ChatMessage[]) => {
      return await api<ChatMessage>("/api/analysis/chat", {
        method: "POST",
        body: JSON.stringify({ analysis, history }),
      });
    },
    onSuccess: (reply) => {
      setMessages((prev) => [...prev, reply]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, chatMutation.isPending]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatMutation.isPending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    chatMutation.mutate(next);
  };

  return (
    <section className="surface rounded-lg overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border/40 px-5 py-3">
        <MessageSquare className="h-4 w-4 text-sage" />
        <p className="font-display text-[11px] uppercase tracking-[0.18em] text-sage">
          Ask the sage
        </p>
        <span className="text-xs text-muted-foreground">
          · follow-up questions about this read
        </span>
      </header>

      <div className="space-y-3 px-5 py-4">
        {messages.length === 0 && !chatMutation.isPending && (
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-sage/10 text-sage">
              <Sparkles className="h-4 w-4" />
            </div>
            <p className="text-xs text-muted-foreground">
              Push back on a call, ask for the bear case, or test a what-if.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border/60 bg-background/30 px-3 py-1 text-xs text-foreground/80 transition-colors hover:border-sage/60 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <Message key={i} message={m} />
        ))}

        {chatMutation.isPending && (
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Thinking…
          </div>
        )}

        {chatMutation.error && (
          <p className="text-xs text-danger">
            Couldn't get an answer: {chatMutation.error.message}
          </p>
        )}

        <div ref={scrollRef} />
      </div>

      <form
        className="flex items-center gap-2 border-t border-border/40 bg-background/40 px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a follow-up…"
          disabled={chatMutation.isPending}
          className="bg-transparent"
        />
        <Button type="submit" size="icon" disabled={!input.trim() || chatMutation.isPending}>
          {chatMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </section>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3.5 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-sage/15 text-foreground"
            : "border border-border/40 bg-card/40 text-foreground/90"
        )}
      >
        <p className="whitespace-pre-wrap">{stripCite(message.content)}</p>
      </div>
    </div>
  );
}
