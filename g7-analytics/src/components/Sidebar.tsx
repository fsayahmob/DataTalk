"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    href: "/analytics",
    label: "Analytics",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v18h18" />
        <path d="M18 9l-5 5-4-4-3 3" />
      </svg>
    ),
  },
  // Placeholder pour futures pages
  // {
  //   href: "/drivers",
  //   label: "Chauffeurs",
  //   icon: (
  //     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
  //       <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
  //       <circle cx="12" cy="7" r="4" />
  //     </svg>
  //   ),
  // },
];

export function Sidebar({ collapsed, onCollapse }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div
      className={`flex flex-col bg-[hsl(260_10%_8%)] border-r border-border/30 ${
        collapsed ? "w-14" : "w-48"
      } transition-all duration-300 ease-in-out`}
    >
      {/* Toggle Menu */}
      <div className="h-14 flex items-center justify-center border-b border-border/30">
        <button
          onClick={() => onCollapse(!collapsed)}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
          title={collapsed ? "Ouvrir le menu" : "Réduire le menu"}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
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

      {/* Toggle button en bas */}
      <div className="p-2 border-t border-border/30">
        <button
          onClick={() => onCollapse(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
          title={collapsed ? "Ouvrir le menu" : "Réduire le menu"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
          >
            <path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
          </svg>
          {!collapsed && <span className="text-xs">Réduire</span>}
        </button>
      </div>
    </div>
  );
}
