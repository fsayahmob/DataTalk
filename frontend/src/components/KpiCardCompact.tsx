"use client";

import { useId } from "react";
import { AreaChart, Area, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Badge } from "@/components/ui/badge";
import { TrendUpIcon, TrendDownIcon } from "@/components/icons";

export interface KpiCompactData {
  id: string;
  title: string;
  value: string | number;
  trend?: { value: number; direction: "up" | "down"; label?: string; invert?: boolean };
  sparkline?: { data: number[]; type: "area" | "bar" };
  footer?: string;
}

interface KpiCardCompactProps {
  data: KpiCompactData;
}

function Sparkline({ data, type }: { data: number[]; type: "area" | "bar" }) {
  const chartData = data.map((value, i) => ({ value, i }));
  const id = useId();

  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey="value" fill="#22d3ee" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={1.5} fill={`url(#${id})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function KpiCardCompact({ data }: KpiCardCompactProps) {
  const { title, value, trend, sparkline, footer } = data;

  // Calculer si la tendance est positive (bonne) ou négative (mauvaise)
  // Si invert=true, une baisse est positive (ex: taux d'insatisfaction)
  const isPositiveTrend = trend
    ? trend.invert
      ? trend.direction === "down" // Invert: baisse = positif
      : trend.direction === "up"   // Normal: hausse = positif
    : false;

  return (
    <div className="bg-secondary/30 border border-border/50 rounded-xl p-4">
      {/* Header: titre + badge trend */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs text-muted-foreground">{title}</p>
        {trend && (
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${
              isPositiveTrend
                ? "text-emerald-400 border-emerald-400/30"
                : "text-rose-400 border-rose-400/30"
            }`}
          >
            {trend.direction === "up" ? <TrendUpIcon size={10} /> : <TrendDownIcon size={10} />}
            {trend.value > 0 ? "+" : ""}{trend.value}%
          </Badge>
        )}
      </div>

      {/* Valeur principale */}
      <p className="text-2xl font-bold text-foreground tabular-nums mb-3">
        {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
      </p>

      {/* Sparkline */}
      {sparkline && sparkline.data.length > 2 && (
        <div className="h-10 mb-3">
          <Sparkline data={sparkline.data} type={sparkline.type} />
        </div>
      )}

      {/* Footer */}
      {(trend?.label || footer) && (
        <div className="text-xs text-muted-foreground">
          {trend?.label && (
            <span className="flex items-center gap-1 text-foreground/80 mb-0.5">
              {trend.label}
              {trend.direction === "up" ? (
                <TrendUpIcon size={12} className={isPositiveTrend ? "text-emerald-400" : "text-rose-400"} />
              ) : (
                <TrendDownIcon size={12} className={isPositiveTrend ? "text-emerald-400" : "text-rose-400"} />
              )}
            </span>
          )}
          {footer && <span>{footer}</span>}
        </div>
      )}
    </div>
  );
}

// Liste verticale simple
export function KpiGridCompact({ kpis }: { kpis: KpiCompactData[] }) {
  return (
    <div className="flex flex-col gap-2">
      {kpis.map((kpi) => (
        <KpiCardCompact key={kpi.id} data={kpi} />
      ))}
    </div>
  );
}
