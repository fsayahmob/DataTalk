"use client";

import { SendIcon, StopIcon } from "@/components/icons";
import { t } from "@/hooks/useTranslation";

interface ChatInputProps {
  question: string;
  loading: boolean;
  useContext: boolean;
  onQuestionChange: (q: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  onUseContextChange: (use: boolean) => void;
}

export function ChatInput({
  question,
  loading,
  useContext,
  onQuestionChange,
  onSubmit,
  onStop,
  onUseContextChange,
}: ChatInputProps) {
  return (
    <div className="p-4 border-t border-border/50 bg-card/30">
      <form onSubmit={onSubmit} className="relative">
        <textarea
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (question.trim() && !loading) {
                onSubmit(e);
              }
            }
          }}
          placeholder={t("chat.placeholder")}
          disabled={loading}
          rows={3}
          className="w-full resize-none rounded-xl border border-border/50 bg-secondary/30 pl-4 pr-12 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {loading ? (
          <button
            type="button"
            onClick={onStop}
            className="absolute right-3 bottom-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all bg-destructive text-destructive-foreground hover:bg-destructive/90"
            title={t("chat.stop_request")}
          >
            <StopIcon size={14} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!question.trim()}
            className={`absolute right-3 bottom-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              question.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            <SendIcon size={16} />
          </button>
        )}
      </form>
      {/* Mode toggle + instructions */}
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onUseContextChange(!useContext)}
          className={`text-[10px] px-2 py-1 rounded-md transition-all flex items-center gap-1.5 ${
            useContext
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-secondary/50 text-muted-foreground border border-border/30 hover:bg-secondary"
          }`}
          title={useContext ? t("chat.with_context") : t("chat.without_context")}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${useContext ? "bg-primary" : "bg-muted-foreground"}`}
          />
          {useContext ? t("chat.with_context") : t("chat.without_context")}
        </button>
        <p className="text-[10px] text-muted-foreground">
          {t("chat.enter_to_send")}
        </p>
      </div>
    </div>
  );
}
