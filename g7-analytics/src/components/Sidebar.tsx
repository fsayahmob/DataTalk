"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HamburgerIcon, ChartIcon, ChevronLeftIcon, CatalogIcon, SettingsIcon } from "@/components/icons";

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
    href: "/settings",
    label: "Paramètres",
    icon: <SettingsIcon size={18} />,
  },
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
          <HamburgerIcon size={20} />
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
          <ChevronLeftIcon size={16} className={`transition-transform ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && <span className="text-xs">Réduire</span>}
        </button>
      </div>
    </div>
  );
}
