"use client";

import { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Message, PredefinedQuestion } from "@/types";
import { PredefinedQuestions } from "@/components/PredefinedQuestions";
import {
  SearchIcon,
  ClockIcon,
  TokensIcon,
  ReplayIcon,
} from "@/components/icons";
import { t } from "@/hooks/useTranslation";

// Animation 3 points
function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="w-2 h-2 bg-current rounded-full animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="w-2 h-2 bg-current rounded-full animate-bounce"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="w-2 h-2 bg-current rounded-full animate-bounce"
        style={{ animationDelay: "300ms" }}
      />
    </span>
  );
}

// Composants Markdown personnalises
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-1">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="bg-primary/20 px-1 py-0.5 rounded text-primary text-xs">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-secondary/50 border border-border/30 rounded-lg p-3 my-2 overflow-x-auto">
      {children}
    </pre>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside my-1 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside my-1 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-sm">{children}</li>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-lg font-bold mt-3 mb-1">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-bold mt-2 mb-1">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>
  ),
};

interface MessageBubbleProps {
  msg: Message;
  isSelected: boolean;
  onSelect: () => void;
  onReplay: () => void;
}

function MessageBubble({
  msg,
  isSelected,
  onSelect,
  onReplay,
}: MessageBubbleProps) {
  const isUser = msg.role === "user";

  return (
    <div
      className={`p-3 rounded-xl cursor-pointer transition-all ${
        isUser
          ? "bg-primary/20 border border-primary/30 text-foreground ml-6"
          : "bg-secondary/30 border border-border/30 mr-4 hover:bg-secondary/50"
      } ${isSelected ? "ring-1 ring-primary/50" : ""}`}
      onClick={() => !isUser && onSelect()}
    >
      {isUser ? (
        <p className="text-sm leading-relaxed">{msg.content}</p>
      ) : (
        <div className="text-sm leading-relaxed markdown-content">
          <ReactMarkdown components={markdownComponents}>
            {msg.content}
          </ReactMarkdown>
        </div>
      )}

      {!isUser && msg.response_time_ms && (
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ClockIcon size={10} />
            {(msg.response_time_ms / 1000).toFixed(1)}s
          </span>
          {msg.tokens_input && msg.tokens_output && (
            <span className="flex items-center gap-1">
              <TokensIcon size={10} />
              {msg.tokens_input + msg.tokens_output}
            </span>
          )}
        </div>
      )}

      {isUser && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReplay();
          }}
          className="mt-2 text-xs opacity-70 hover:opacity-100 flex items-center gap-1"
        >
          <ReplayIcon size={12} />
          {t("chat.retry")}
        </button>
      )}
    </div>
  );
}

interface ChatMessagesProps {
  messages: Message[];
  loading: boolean;
  selectedMessage: Message | null;
  onSelectMessage: (msg: Message) => void;
  predefinedQuestions: PredefinedQuestion[];
  onQuestionClick: (q: string) => void;
  onReplayMessage: (msg: Message) => void;
}

export function ChatMessages({
  messages,
  loading,
  selectedMessage,
  onSelectMessage,
  predefinedQuestions,
  onQuestionClick,
  onReplayMessage,
}: ChatMessagesProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll vers le bas
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {messages.length === 0 && (
        <div className="space-y-2">
          <div className="text-center py-3">
            <div className="w-10 h-10 mx-auto mb-2 bg-secondary/30 rounded-lg flex items-center justify-center">
              <SearchIcon size={20} className="text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("chat.ask_natural_language")}
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              {t("chat.or_select_suggestion")}
            </p>
          </div>

          {/* Questions predefinies */}
          <PredefinedQuestions
            questions={predefinedQuestions}
            onQuestionClick={onQuestionClick}
          />
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          msg={msg}
          isSelected={selectedMessage?.id === msg.id}
          onSelect={() => onSelectMessage(msg)}
          onReplay={() => onReplayMessage(msg)}
        />
      ))}

      {loading && (
        <div className="bg-secondary/50 border border-border/50 p-3 rounded-xl mr-4 flex items-center gap-2">
          <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center">
            <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
          </div>
          <span className="text-sm text-muted-foreground">
            {t("chat.analyzing")}
          </span>
          <LoadingDots />
        </div>
      )}

      <div ref={chatEndRef} />
    </div>
  );
}
