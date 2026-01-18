"use client";

import { useId } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendUpIcon, TrendDownIcon } from "@/components/icons";

// Types pour les KPIs
export interface KpiData {
  id: string;
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: number;
    direction: "up" | "down";
    label?: string;
  };
  sparkline?: {
    data: number[];
    type: "area" | "line" | "bar";
    color?: string;
  };
  footer?: string;
}

interface KpiCardProps {
  data: KpiData;
  className?: string;
}

// Couleurs pour les sparklines
const SPARKLINE_COLORS = {
  primary: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#06b6d4",
};

// Mini sparkline component
function Sparkline({
  data,
  type,
  color = "primary",
}: {
  data: number[];
  type: "area" | "line" | "bar";
  color?: string;
}) {
  const chartData = data.map((value, index) => ({ value, index }));
  const strokeColor = SPARKLINE_COLORS[color as keyof typeof SPARKLINE_COLORS] || color;
  const chartId = useId();

  const commonProps = {
    data: chartData,
    margin: { top: 2, right: 2, left: 2, bottom: 2 },
  };

  switch (type) {
    case "area":
      return (
        <ResponsiveContainer width="100%" height={40}>
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id={`${chartId}-gradient`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity={0.4} />
                <stop offset="100%" stopColor={strokeColor} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={strokeColor}
              strokeWidth={2}
              fill={`url(#${chartId}-gradient)`}
            />
          </AreaChart>
        </ResponsiveContainer>
      );

    case "line":
      return (
        <ResponsiveContainer width="100%" height={40}>
          <LineChart {...commonProps}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={strokeColor}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      );

    case "bar":
      return (
        <ResponsiveContainer width="100%" height={40}>
          <BarChart {...commonProps}>
            <Bar dataKey="value" fill={strokeColor} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );

    default:
      return null;
  }
}

export function KpiCard({ data, className }: KpiCardProps) {
  const { title, value, description, trend, sparkline, footer } = data;

  return (
    <Card className={`@container/card ${className || ""}`}>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
        </CardTitle>
        {trend && (
          <CardAction>
            <Badge
              variant="outline"
              className={
                trend.direction === "up"
                  ? "text-status-success border-status-success/30"
                  : "text-status-error border-status-error/30"
              }
            >
              {trend.direction === "up" ? (
                <TrendUpIcon size={14} />
              ) : (
                <TrendDownIcon size={14} />
              )}
              {trend.value > 0 ? "+" : ""}
              {trend.value}%
            </Badge>
          </CardAction>
        )}
      </CardHeader>

      {sparkline && sparkline.data.length > 0 && (
        <div className="px-6 -mt-2">
          <Sparkline
            data={sparkline.data}
            type={sparkline.type}
            color={sparkline.color}
          />
        </div>
      )}

      {(footer || description || trend?.label) && (
        <CardFooter className="flex-col items-start gap-1 text-sm">
          {trend?.label && (
            <div className="flex gap-2 font-medium text-foreground">
              {trend.label}
              {trend.direction === "up" ? (
                <TrendUpIcon size={16} className="text-status-success" />
              ) : (
                <TrendDownIcon size={16} className="text-status-error" />
              )}
            </div>
          )}
          {(footer || description) && (
            <div className="text-muted-foreground text-xs">
              {footer || description}
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

// Grid de KPIs
interface KpiGridProps {
  kpis: KpiData[];
  columns?: 2 | 3 | 4;
  className?: string;
}

export function KpiGrid({ kpis, columns = 4, className }: KpiGridProps) {
  const gridCols = {
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div
      className={`grid gap-4 ${gridCols[columns]} ${className || ""}`}
    >
      {kpis.map((kpi) => (
        <KpiCard key={kpi.id} data={kpi} />
      ))}
    </div>
  );
}
