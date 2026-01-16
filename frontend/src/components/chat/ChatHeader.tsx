"use client";

import { Button } from "@/components/ui/button";
import {
  ChatIcon,
  ClockIcon,
  PlusIcon,
  ChevronLeftIcon,
} from "@/components/icons";
import { t } from "@/hooks/useTranslation";

interface ChatHeaderProps {
  showHistory: boolean;
  onShowHistoryChange: (show: boolean) => void;
  onNewConversation: () => void;
  onCollapse: () => void;
}

export function ChatHeader({
  showHistory,
  onShowHistoryChange,
  onNewConversation,
  onCollapse,
}: ChatHeaderProps) {
  return (
    <div className="h-12 px-3 border-b border-border/50 bg-secondary/30 flex items-center justify-between">
      <h3 className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
        <ChatIcon size={14} />
        Chat
      </h3>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 w-7 p-0 hover:bg-primary/20 ${showHistory ? "bg-primary/20" : ""}`}
          onClick={() => onShowHistoryChange(!showHistory)}
          title={t("chat.history")}
        >
          <ClockIcon size={14} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 hover:bg-primary/20"
          onClick={() => {
            onNewConversation();
            onShowHistoryChange(false);
          }}
          title={t("chat.new_conversation")}
        >
          <PlusIcon size={14} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 hover:bg-primary/20"
          onClick={onCollapse}
          title={t("common.collapse")}
        >
          <ChevronLeftIcon size={14} />
        </Button>
      </div>
    </div>
  );
}
