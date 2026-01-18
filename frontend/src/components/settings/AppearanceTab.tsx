"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { ThemeStyleSelector } from "@/components/ThemeStyleSelector";
import { useThemeStyle } from "@/components/ThemeProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Monitor, Moon, Sun } from "lucide-react";

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const { style } = useThemeStyle();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-muted/30 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Color Mode Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Color Mode</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Choose between light and dark mode
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground w-24">
            Mode
          </span>
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger id="color-mode" className="w-48 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light" className="text-xs">
                <div className="flex items-center gap-2">
                  <Sun className="w-3.5 h-3.5" />
                  Light
                </div>
              </SelectItem>
              <SelectItem value="dark" className="text-xs">
                <div className="flex items-center gap-2">
                  <Moon className="w-3.5 h-3.5" />
                  Dark
                </div>
              </SelectItem>
              <SelectItem value="system" className="text-xs">
                <div className="flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5" />
                  System
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Theme Style Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Theme Style</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Select a color palette for the interface
          </p>
        </div>

        <ThemeStyleSelector />

        <p className="text-xs text-muted-foreground">
          Current: <span className="text-foreground font-medium capitalize">{style}</span>
        </p>
      </div>
    </div>
  );
}
