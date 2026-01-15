"use client";

import { useId } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Types pour les charts analytiques
export interface ChartData {
  id: string;
  title: string;
  description?: string;
  type: "area" | "line" | "bar" | "pie";
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
  colors?: string[];
}

interface ChartCardProps {
  data: ChartData;
  height?: number;
  className?: string;
}

// Palette de couleurs
const DEFAULT_COLORS = [
  "#a78bfa", // Violet
  "#22d3ee", // Cyan
  "#fbbf24", // Or
  "#f472b6", // Magenta
  "#34d399", // Vert
  "#fb923c", // Orange
  "#60a5fa", // Bleu
  "#e879f9", // Fuchsia
];

// Styles pour dark mode
const axisStyle = { fill: "#a1a1aa", fontSize: 11 };
const gridStyle = { stroke: "#3f3f46", strokeDasharray: "3 3" };
const axisLineStyle = { stroke: "#52525b" };

// Custom tooltip
const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm font-medium text-foreground">
            <span style={{ color: entry.color }}>{entry.dataKey}:</span>{" "}
            {typeof entry.value === "number"
              ? entry.value.toLocaleString("fr-FR")
              : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function ChartCard({ data, height = 300, className }: ChartCardProps) {
  const { title, description, type, data: chartData, xKey, yKeys, colors } = data;
  const chartColors = colors || DEFAULT_COLORS;
  const chartId = useId();

  const commonProps = {
    data: chartData,
    margin: { top: 10, right: 30, left: 0, bottom: 0 },
  };

  const renderChart = () => {
    switch (type) {
      case "area":
        return (
          <AreaChart {...commonProps}>
            <defs>
              {yKeys.map((key, idx) => (
                <linearGradient key={key} id={`${chartId}-area-${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColors[idx % chartColors.length]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={chartColors[idx % chartColors.length]} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...gridStyle} vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={axisStyle}
              axisLine={axisLineStyle}
              tickLine={axisLineStyle}
            />
            <YAxis tick={axisStyle} axisLine={axisLineStyle} tickLine={axisLineStyle} />
            <Tooltip content={<CustomTooltip />} />
            {yKeys.length > 1 && <Legend />}
            {yKeys.map((key, idx) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={chartColors[idx % chartColors.length]}
                strokeWidth={2}
                fill={`url(#${chartId}-area-${idx})`}
              />
            ))}
          </AreaChart>
        );

      case "line":
        return (
          <LineChart {...commonProps}>
            <CartesianGrid {...gridStyle} vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={axisStyle}
              axisLine={axisLineStyle}
              tickLine={axisLineStyle}
            />
            <YAxis tick={axisStyle} axisLine={axisLineStyle} tickLine={axisLineStyle} />
            <Tooltip content={<CustomTooltip />} />
            {yKeys.length > 1 && <Legend />}
            {yKeys.map((key, idx) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={chartColors[idx % chartColors.length]}
                strokeWidth={2}
                dot={{ r: 3, fill: chartColors[idx % chartColors.length] }}
              />
            ))}
          </LineChart>
        );

      case "bar":
        return (
          <BarChart {...commonProps}>
            <defs>
              {yKeys.map((key, idx) => (
                <linearGradient key={key} id={`${chartId}-bar-${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColors[idx % chartColors.length]} stopOpacity={1} />
                  <stop offset="100%" stopColor={chartColors[idx % chartColors.length]} stopOpacity={0.6} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...gridStyle} vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={axisStyle}
              axisLine={axisLineStyle}
              tickLine={axisLineStyle}
            />
            <YAxis tick={axisStyle} axisLine={axisLineStyle} tickLine={axisLineStyle} />
            <Tooltip content={<CustomTooltip />} />
            {yKeys.length > 1 && <Legend />}
            {yKeys.map((key, idx) => (
              <Bar
                key={key}
                dataKey={key}
                fill={`url(#${chartId}-bar-${idx})`}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );

      case "pie":
        return (
          <PieChart>
            <Pie
              data={chartData}
              dataKey={yKeys[0]}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
            >
              {chartData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={chartColors[index % chartColors.length]}
                  stroke="#1c1c22"
                  strokeWidth={1}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </PieChart>
        );

      default:
        return null;
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          {renderChart() || <div />}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// Grid de charts
interface ChartGridProps {
  charts: ChartData[];
  columns?: 1 | 2 | 3;
  height?: number;
  className?: string;
}

export function ChartGrid({ charts, columns = 2, height = 250, className }: ChartGridProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 lg:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  };

  return (
    <div className={`grid gap-4 ${gridCols[columns]} ${className || ""}`}>
      {charts.map((chart) => (
        <ChartCard key={chart.id} data={chart} height={height} />
      ))}
    </div>
  );
}
