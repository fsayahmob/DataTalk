"use client";

import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { LLMCosts } from "@/lib/api";

interface UsageTabProps {
  costs: LLMCosts | null;
  costsPeriod: number;
  onPeriodChange: (period: number) => void;
}

type ChartMetric = "tokens" | "cost";

const AXIS_STYLE = { fill: "#71717a", fontSize: 10 };
const GRID_STYLE = { stroke: "#27272a", strokeDasharray: "2 2" };

export function UsageTab({ costs, costsPeriod, onPeriodChange }: UsageTabProps) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>("tokens");
  const [selectedModel, setSelectedModel] = useState<string>("all");

  // Liste des modèles disponibles
  const modelOptions = useMemo(() => {
    if (!costs?.by_model) return [];
    return costs.by_model.map((m) => ({
      value: m.model_name,
      label: `${m.model_name} (${m.provider_name})`,
    }));
  }, [costs?.by_model]);

  // Données du graphe (triées par date croissante)
  const chartData = useMemo(() => {
    if (!costs?.by_date) return [];
    return [...costs.by_date].sort((a, b) => a.date.localeCompare(b.date));
  }, [costs?.by_date]);

  // Formatter pour le tooltip
  const formatValue = (value: number, metric: ChartMetric) => {
    if (metric === "cost") {
      return `$${value.toFixed(4)}`;
    }
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toString();
  };

  // Données filtrées par modèle pour le tableau
  const filteredModelData = useMemo(() => {
    if (!costs?.by_model) return [];
    if (selectedModel === "all") return costs.by_model;
    return costs.by_model.filter((m) => m.model_name === selectedModel);
  }, [costs?.by_model, selectedModel]);

  // Totaux filtrés
  const filteredTotals = useMemo(() => {
    if (selectedModel === "all" || !costs) {
      return costs?.total;
    }
    const modelData = costs.by_model.find((m) => m.model_name === selectedModel);
    if (!modelData) return costs.total;
    return {
      total_calls: modelData.calls,
      total_tokens_input: modelData.tokens_input,
      total_tokens_output: modelData.tokens_output,
      total_cost: modelData.cost,
    };
  }, [costs, selectedModel]);

  return (
    <div className="space-y-4">
      {/* Header avec stats et filtres */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-4 text-xs">
          {filteredTotals && (
            <>
              <div>
                <span className="text-muted-foreground">Calls:</span>{" "}
                <span className="font-mono text-foreground">{filteredTotals.total_calls}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Input:</span>{" "}
                <span className="font-mono text-foreground">
                  {(filteredTotals.total_tokens_input / 1000).toFixed(1)}k
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Output:</span>{" "}
                <span className="font-mono text-foreground">
                  {(filteredTotals.total_tokens_output / 1000).toFixed(1)}k
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Cost:</span>{" "}
                <span className="font-mono text-primary">
                  ${filteredTotals.total_cost.toFixed(4)}
                </span>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Filtre par modèle */}
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-44 h-7 text-xs">
              <SelectValue placeholder="All models" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {modelOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Période */}
          <Select
            value={String(costsPeriod)}
            onValueChange={(v) => onPeriodChange(Number(v))}
          >
            <SelectTrigger className="w-24 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Graphe unique switchable */}
      {chartData.length > 0 && (
        <div className="border border-border/30 rounded-md p-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground">
              {chartMetric === "tokens" ? "Tokens / day" : "Cost / day ($)"}
            </p>
            {/* Switch tokens/cost */}
            <div className="flex items-center gap-1 bg-secondary/50 rounded-md p-0.5">
              <button
                onClick={() => setChartMetric("tokens")}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  chartMetric === "tokens"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tokens
              </button>
              <button
                onClick={() => setChartMetric("cost")}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  chartMetric === "cost"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cost
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 20 }}>
              <defs>
                <linearGradient id="gradientTokens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradientCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_STYLE} vertical={false} />
              <XAxis
                dataKey="date"
                tick={AXIS_STYLE}
                angle={-45}
                textAnchor="end"
                height={50}
                tickFormatter={(date) => {
                  const d = new Date(date);
                  return `${d.getDate()}/${d.getMonth() + 1}`;
                }}
              />
              <YAxis
                tick={AXIS_STYLE}
                width={45}
                tickFormatter={(v) =>
                  chartMetric === "cost"
                    ? `$${v.toFixed(2)}`
                    : v >= 1000
                      ? `${(v / 1000).toFixed(0)}k`
                      : v
                }
              />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #27272a",
                  fontSize: 11,
                  borderRadius: 6,
                }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(value) => {
                  const numValue = typeof value === "number" ? value : 0;
                  return [
                    formatValue(numValue, chartMetric),
                    chartMetric === "tokens" ? "Total tokens" : "Cost",
                  ];
                }}
              />
              {chartMetric === "tokens" ? (
                <>
                  <Area
                    type="monotone"
                    dataKey="tokens_input"
                    stackId="1"
                    stroke="#a78bfa"
                    fill="url(#gradientTokens)"
                    strokeWidth={1.5}
                    name="Input"
                  />
                  <Area
                    type="monotone"
                    dataKey="tokens_output"
                    stackId="1"
                    stroke="#c4b5fd"
                    fill="url(#gradientTokens)"
                    strokeWidth={1.5}
                    name="Output"
                  />
                </>
              ) : (
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#22d3ee"
                  fill="url(#gradientCost)"
                  strokeWidth={1.5}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tableau par modèle */}
      {filteredModelData.length > 0 && (
        <div className="border border-border/30 rounded-md">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Model</TableHead>
                <TableHead className="text-xs">Provider</TableHead>
                <TableHead className="text-xs text-right">Calls</TableHead>
                <TableHead className="text-xs text-right">Input</TableHead>
                <TableHead className="text-xs text-right">Output</TableHead>
                <TableHead className="text-xs text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredModelData.map((m, i) => (
                <TableRow key={i}>
                  <TableCell className="py-2">
                    <code className="text-xs text-foreground">{m.model_name}</code>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="text-xs text-muted-foreground">{m.provider_name}</span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span className="text-xs font-mono text-muted-foreground">{m.calls}</span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span className="text-xs font-mono text-muted-foreground">
                      {(m.tokens_input / 1000).toFixed(1)}k
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span className="text-xs font-mono text-muted-foreground">
                      {(m.tokens_output / 1000).toFixed(1)}k
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span className="text-xs font-mono text-primary">${m.cost.toFixed(4)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(!costs || costs.total.total_calls === 0) && (
        <p className="text-xs text-muted-foreground text-center py-8">No usage data</p>
      )}
    </div>
  );
}
