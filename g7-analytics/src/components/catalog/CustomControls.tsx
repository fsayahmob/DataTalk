"use client";

import { useReactFlow } from "@xyflow/react";
import { Button } from "@/components/ui/button";

export function CustomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="absolute bottom-4 left-4 flex flex-col gap-1 bg-[hsl(260_10%_12%)] border border-border/50 rounded-lg p-1 shadow-xl">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-primary/20"
        onClick={() => zoomIn()}
        title="Zoom +"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-primary/20"
        onClick={() => zoomOut()}
        title="Zoom -"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14" />
        </svg>
      </Button>
      <div className="h-px bg-border/50 my-1" />
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-primary/20"
        onClick={() => fitView({ padding: 0.2 })}
        title="Ajuster la vue"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </Button>
    </div>
  );
}
