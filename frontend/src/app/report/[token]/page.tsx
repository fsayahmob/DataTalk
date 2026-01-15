"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchSharedReport, SharedReportResponse } from "@/lib/api";
import { ChartPanel, TablePanel } from "@/components/panels";
import { ChartIcon } from "@/components/icons";

export default function SharedReportPage() {
  const params = useParams();
  const token = params.token as string;

  const [report, setReport] = useState<SharedReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    setLoading(true);
    fetchSharedReport(token)
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement du rapport...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-destructive/10 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">Rapport non trouvé</h1>
          <p className="text-muted-foreground">{error || "Ce lien de partage n'est pas valide."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border/50 px-6 flex items-center justify-between bg-sidebar">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <ChartIcon size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-foreground">{report.title}</h1>
            <p className="text-xs text-muted-foreground">TalkData - Rapport partagé</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col overflow-hidden p-6">
        {/* Question */}
        {report.question && report.question !== report.title && (
          <div className="mb-4 p-3 bg-secondary/30 rounded-lg border border-border/30">
            <p className="text-sm text-muted-foreground">Question:</p>
            <p className="text-foreground">{report.question}</p>
          </div>
        )}

        {/* Chart */}
        {report.chart && report.chart.type !== "none" && report.data && (
          <div className="mb-4">
            <ChartPanel config={report.chart} data={report.data} />
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-hidden rounded-lg border border-border/30">
          <TablePanel data={report.data || []} />
        </div>
      </main>

      {/* Footer */}
      <footer className="h-10 border-t border-border/50 px-6 flex items-center justify-center bg-sidebar">
        <p className="text-xs text-muted-foreground">
          Généré avec TalkData
        </p>
      </footer>
    </div>
  );
}
