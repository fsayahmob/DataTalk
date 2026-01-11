"use client";

import { KpiGrid, KpiData } from "@/components/KpiCard";
import { ChartGrid, ChartData } from "@/components/ChartCard";

// Générateur de données aléatoires
function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function generateSparklineData(length: number, min: number, max: number) {
  return Array.from({ length }, () => randomInt(min, max));
}

function generateTimeSeriesData(days: number) {
  const data = [];
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - days);

  for (let i = 0; i < days; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    data.push({
      date: date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
      evaluations: randomInt(1500, 2500),
      commentaires: randomInt(200, 500),
      satisfaction: randomFloat(3.5, 4.8, 1),
    });
  }
  return data;
}

function generateCategoryData() {
  const categories = [
    "Chauffeur",
    "Véhicule",
    "Prix",
    "Ponctualité",
    "Application",
    "Trajet",
  ];
  return categories.map((name) => ({
    categorie: name,
    positif: randomInt(50, 200),
    negatif: randomInt(10, 80),
    neutre: randomInt(20, 100),
  }));
}

function generatePieData() {
  return [
    { segment: "Entreprise", value: randomInt(30, 50) },
    { segment: "Particulier", value: randomInt(20, 40) },
    { segment: "VIP", value: randomInt(10, 25) },
    { segment: "Premium", value: randomInt(5, 15) },
    { segment: "Standard", value: randomInt(5, 10) },
  ];
}

// Données KPI simulées
const kpiData: KpiData[] = [
  {
    id: "total-evaluations",
    title: "Total Évaluations",
    value: 64383,
    trend: { value: 12.5, direction: "up", label: "En hausse ce mois" },
    sparkline: { data: generateSparklineData(12, 4000, 6000), type: "area", color: "primary" },
    footer: "Données mai 2024",
  },
  {
    id: "note-moyenne",
    title: "Note Moyenne",
    value: "4.32",
    trend: { value: 3.2, direction: "up", label: "Amélioration continue" },
    sparkline: { data: generateSparklineData(12, 40, 48), type: "line", color: "success" },
    footer: "Sur 5 étoiles",
  },
  {
    id: "commentaires",
    title: "Avec Commentaires",
    value: 7255,
    description: "11.3% des évaluations",
    trend: { value: 8.1, direction: "up" },
    sparkline: { data: generateSparklineData(12, 500, 800), type: "bar", color: "info" },
  },
  {
    id: "sentiment-positif",
    title: "Sentiment Positif",
    value: "67%",
    trend: { value: 2.4, direction: "down", label: "Légère baisse" },
    sparkline: { data: generateSparklineData(12, 60, 75), type: "area", color: "warning" },
    footer: "Basé sur l'analyse NLP",
  },
];

// Données Charts simulées
const chartData: ChartData[] = [
  {
    id: "evolution-quotidienne",
    title: "Évolution Quotidienne",
    description: "Évaluations et commentaires sur 30 jours",
    type: "area",
    data: generateTimeSeriesData(30),
    xKey: "date",
    yKeys: ["evaluations", "commentaires"],
  },
  {
    id: "sentiment-categories",
    title: "Sentiment par Catégorie",
    description: "Répartition positif / négatif / neutre",
    type: "bar",
    data: generateCategoryData(),
    xKey: "categorie",
    yKeys: ["positif", "negatif", "neutre"],
    colors: ["#34d399", "#f87171", "#a1a1aa"],
  },
  {
    id: "tendance-satisfaction",
    title: "Tendance Satisfaction",
    description: "Note moyenne sur 30 jours",
    type: "line",
    data: generateTimeSeriesData(30),
    xKey: "date",
    yKeys: ["satisfaction"],
  },
  {
    id: "repartition-clients",
    title: "Répartition Clients",
    description: "Par segment de clientèle",
    type: "pie",
    data: generatePieData(),
    xKey: "segment",
    yKeys: ["value"],
  },
];

export default function TestComponentsPage() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Test Composants UI
          </h1>
          <p className="text-muted-foreground mt-1">
            Preview des KPI Cards et Charts avec données aléatoires
          </p>
        </div>

        {/* Section KPIs */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            KPI Cards (avec sparklines)
          </h2>
          <KpiGrid kpis={kpiData} columns={4} />
        </section>

        {/* Section Charts */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Charts Analytiques
          </h2>
          <ChartGrid charts={chartData} columns={2} height={280} />
        </section>

        {/* Section KPIs 2 colonnes */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            KPI Cards (2 colonnes)
          </h2>
          <KpiGrid kpis={kpiData.slice(0, 2)} columns={2} />
        </section>

        {/* Section Charts 1 colonne */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Chart Pleine Largeur
          </h2>
          <ChartGrid charts={[chartData[0]]} columns={1} height={350} />
        </section>
      </div>
    </div>
  );
}
