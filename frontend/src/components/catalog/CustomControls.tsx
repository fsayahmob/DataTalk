"use client";

import { useReactFlow } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { ZoomInIcon, ZoomOutIcon, FitViewIcon } from "@/components/icons";

export function CustomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="absolute bottom-4 left-4 flex flex-col gap-1 bg-card border border-border/50 rounded-lg p-1 shadow-xl">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-primary/20"
        onClick={() => void zoomIn()}
        title="Zoom +"
      >
        <ZoomInIcon size={16} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-primary/20"
        onClick={() => void zoomOut()}
        title="Zoom -"
      >
        <ZoomOutIcon size={16} />
      </Button>
      <div className="h-px bg-border/50 my-1" />
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 hover:bg-primary/20"
        onClick={() => void fitView({ padding: 0.2 })}
        title="Ajuster la vue"
      >
        <FitViewIcon size={16} />
      </Button>
    </div>
  );
}
