import { Loader2, Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "data";
}

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

/**
 * Spinner component with two variants:
 * - default: Standard rotating loader
 * - data: Database icon with pulse animation (data-themed)
 */
export function Spinner({ className, size = "md", variant = "default" }: SpinnerProps) {
  if (variant === "data") {
    return (
      <div className={cn("relative", sizeClasses[size], className)}>
        <Database className={cn("animate-pulse text-primary", sizeClasses[size])} />
        <div className="absolute inset-0 animate-ping opacity-30">
          <Database className={cn("text-primary", sizeClasses[size])} />
        </div>
      </div>
    );
  }

  return (
    <Loader2 className={cn("animate-spin text-primary", sizeClasses[size], className)} />
  );
}

interface LoadingStateProps {
  message?: string;
  variant?: "default" | "data";
}

/**
 * Full loading state with spinner and optional message
 */
export function LoadingState({ message, variant = "data" }: LoadingStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <Spinner size="lg" variant={variant} className="mx-auto mb-4" />
        {message && <p className="text-muted-foreground text-sm">{message}</p>}
      </div>
    </div>
  );
}
