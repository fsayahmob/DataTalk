"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, ChevronLeftIcon, CatalogIcon, SettingsIcon, ActivityIcon } from "@/components/icons";
import * as api from "@/lib/api";
import type { LLMStatus } from "@/lib/api";

interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Analytics",
    icon: <ChartIcon size={18} />,
  },
  {
    href: "/catalog",
    label: "Catalogue",
    icon: <CatalogIcon size={18} />,
  },
  {
    href: "/runs",
    label: "Runs",
    icon: <ActivityIcon size={18} />,
  },
  {
    href: "/settings",
    label: "Paramètres",
    icon: <SettingsIcon size={18} />,
  },
];

export function Sidebar({ collapsed, onCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);

  useEffect(() => {
    api.fetchLLMStatus().then(setLlmStatus);
  }, [pathname]);

  return (
    <div
      className={`flex flex-col bg-[hsl(260_10%_8%)] border-r border-border/30 ${
        collapsed ? "w-14" : "w-48"
      } transition-all duration-300 ease-in-out`}
    >
      {/* Logo G7 + Toggle */}
      <div className="h-14 flex items-center justify-center border-b border-border/30">
        <button
          onClick={() => onCollapse(!collapsed)}
          className="w-10 h-10 bg-gradient-to-br from-primary to-primary/60 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow cursor-pointer"
          title={collapsed ? "Ouvrir le menu" : "Réduire le menu"}
        >
          <span className="text-primary-foreground font-bold text-lg">G7</span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    isActive
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={isActive ? "text-primary" : ""}>{item.icon}</span>
                  {!collapsed && (
                    <span className="text-sm font-medium">{item.label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* LLM Status */}
      <div className="px-2 py-3 border-t border-border/30">
        <div
          className={`relative group flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/30 ${
            collapsed ? "justify-center" : ""
          }`}
          title={collapsed ? `${llmStatus?.status === "ok" ? "Connecté" : "Déconnecté"} - ${llmStatus?.model || "Non configuré"}` : undefined}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              llmStatus?.status === "ok"
                ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                : "bg-red-500 shadow-sm shadow-red-500/50"
            }`}
          />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {llmStatus?.status === "ok" ? "Connecté" : "Déconnecté"}
              </p>
              <p className="text-xs font-medium text-foreground truncate">
                {llmStatus?.model || "Non configuré"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Toggle button en bas */}
      <div className="p-2 border-t border-border/30">
        <button
          onClick={() => onCollapse(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
          title={collapsed ? "Ouvrir le menu" : "Réduire le menu"}
        >
          <ChevronLeftIcon size={16} className={`transition-transform ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && <span className="text-xs">Réduire</span>}
        </button>
      </div>
    </div>
  );
}
