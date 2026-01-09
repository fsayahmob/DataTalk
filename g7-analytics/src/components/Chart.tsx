"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ChartConfig } from "@/lib/schema";

// Palette professionnelle pour dataviz dark mode
const COLORS = [
  "#a78bfa", // Violet G7
  "#22d3ee", // Cyan
  "#fbbf24", // Or
  "#f472b6", // Magenta
  "#34d399", // Vert
  "#fb923c", // Orange
  "#60a5fa", // Bleu
  "#e879f9", // Fuchsia
  "#4ade80", // Lime
  "#f87171", // Rouge doux
];

// Gradient IDs
const GRADIENT_ID = "chartGradient";

interface ChartProps {
  config: ChartConfig;
  data: Record<string, unknown>[];
}

// Custom tooltip pour dark mode
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm font-medium text-foreground">
            {entry.dataKey}: <span className="text-primary">{typeof entry.value === 'number' ? entry.value.toLocaleString('fr-FR') : entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function Chart({ config, data }: ChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-secondary/30 rounded-lg border border-border">
        <p className="text-muted-foreground">Aucune donnée à afficher</p>
      </div>
    );
  }

  const commonProps = {
    data,
    margin: { top: 20, right: 30, left: 20, bottom: 60 },
  };

  // Multi-séries: utiliser le tableau Y si fourni, sinon une seule série
  const yKeys = Array.isArray(config.y) ? config.y : [config.y];

  // Détecte si l'axe Y représente une note (valeurs entre 0 et 5)
  const allYValues = yKeys.flatMap(yKey => data.map(d => Number(d[yKey]) || 0));
  const maxY = Math.max(...allYValues);
  const minY = Math.min(...allYValues);
  const isRatingScale = yKeys.some(y => y?.includes("note")) || (minY >= 0 && maxY <= 5.5);
  const yDomain = isRatingScale ? [0, 5] : undefined;

  // Styles communs pour dark mode - couleurs explicites car Recharts n'interprète pas les variables CSS
  const axisStyle = { fill: "#a1a1aa", fontSize: 11 }; // zinc-400
  const gridStyle = { stroke: "#3f3f46", strokeDasharray: "3 3" }; // zinc-700
  const axisLineStyle = { stroke: "#52525b" }; // zinc-600
  const legendStyle = { paddingTop: 20, color: "#a1a1aa" }; // zinc-400

  switch (config.type) {
    case "bar":
      return (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart {...commonProps}>
            <defs>
              {yKeys.map((_, idx) => (
                <linearGradient key={idx} id={`${GRADIENT_ID}-bar-${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={1} />
                  <stop offset="100%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.6} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...gridStyle} vertical={false} />
            <XAxis
              dataKey={config.x}
              angle={-45}
              textAnchor="end"
              height={80}
              tick={axisStyle}
              axisLine={axisLineStyle}
              tickLine={axisLineStyle}
            />
            <YAxis
              tick={axisStyle}
              domain={yDomain}
              axisLine={axisLineStyle}
              tickLine={axisLineStyle}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "#3f3f46", fillOpacity: 0.5 }} />
            <Legend wrapperStyle={legendStyle} />
            {yKeys.map((yKey, idx) => (
              <Bar
                key={yKey}
                dataKey={yKey}
                fill={`url(#${GRADIENT_ID}-bar-${idx})`}
                radius={[6, 6, 0, 0]}
                maxBarSize={60}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );

    case "line":
      return (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart {...commonProps}>
            <CartesianGrid {...gridStyle} vertical={false} />
            <XAxis
              dataKey={config.x}
              angle={-45}
              textAnchor="end"
              height={80}
              tick={axisStyle}
              axisLine={axisLineStyle}
              tickLine={axisLineStyle}
            />
            <YAxis
              tick={axisStyle}
              domain={yDomain}
              axisLine={axisLineStyle}
              tickLine={axisLineStyle}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={legendStyle} />
            {yKeys.map((yKey, idx) => (
              <Line
                key={yKey}
                type="monotone"
                dataKey={yKey}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={3}
                dot={{ r: 4, fill: COLORS[idx % COLORS.length], strokeWidth: 0 }}
                activeDot={{ r: 6, fill: COLORS[idx % COLORS.length], stroke: "#1c1c22", strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );

    case "pie":
      // Pie chart ne supporte qu'une série, on prend la première
      const pieYKey = yKeys[0];
      return (
        <ResponsiveContainer width="100%" height={400}>
          <PieChart>
            <defs>
              {COLORS.map((color, index) => (
                <linearGradient key={index} id={`${GRADIENT_ID}-pie-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={1} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.7} />
                </linearGradient>
              ))}
            </defs>
            <Pie
              data={data}
              dataKey={pieYKey}
              nameKey={config.x}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={140}
              paddingAngle={2}
              label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(1)}%`}
              labelLine={{ stroke: "#a1a1aa", strokeWidth: 1 }}
            >
              {data.map((_, index) => (
                <Cell
                  key={index}
                  fill={`url(#${GRADIENT_ID}-pie-${index % COLORS.length})`}
                  stroke="#1c1c22"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={legendStyle} />
          </PieChart>
        </ResponsiveContainer>
      );

    case "area":
      return (
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart {...commonProps}>
            <defs>
              {yKeys.map((_, idx) => (
                <linearGradient key={idx} id={`${GRADIENT_ID}-area-${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...gridStyle} vertical={false} />
            <XAxis
              dataKey={config.x}
              angle={-45}
              textAnchor="end"
              height={80}
              tick={axisStyle}
              axisLine={axisLineStyle}
              tickLine={axisLineStyle}
            />
            <YAxis
              tick={axisStyle}
              domain={yDomain}
              axisLine={axisLineStyle}
              tickLine={axisLineStyle}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={legendStyle} />
            {yKeys.map((yKey, idx) => (
              <Area
                key={yKey}
                type="monotone"
                dataKey={yKey}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={2}
                fill={`url(#${GRADIENT_ID}-area-${idx})`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );

    case "scatter":
      return (
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart {...commonProps}>
            <CartesianGrid {...gridStyle} />
            <XAxis
              dataKey={config.x}
              name={config.x}
              tick={axisStyle}
              axisLine={axisLineStyle}
              tickLine={axisLineStyle}
            />
            <YAxis
              dataKey={Array.isArray(config.y) ? config.y[0] : config.y}
              name={Array.isArray(config.y) ? config.y[0] : config.y}
              tick={axisStyle}
              axisLine={axisLineStyle}
              tickLine={axisLineStyle}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#a1a1aa" }} />
            <Legend wrapperStyle={legendStyle} />
            <Scatter
              name="Données"
              data={data}
              fill="#a78bfa"
            >
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      );

    case "none":
    default:
      return null;
  }
}
