"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { fetchSharedReport, SharedReportResponse } from "@/lib/api";
import { TablePanel } from "@/components/panels";
import { Chart } from "@/components/Chart";
import { ChartIcon, ExpandIcon } from "@/components/icons";
import { t } from "@/hooks/useTranslation";

export default function SharedReportPage() {
  const params = useParams();
  const token = params.token as string;

  const [report, setReport] = useState<SharedReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async (reportToken: string) => {
    try {
      const data = await fetchSharedReport(reportToken);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown_error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadReport(token);
  }, [token, loadReport]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t("report.loading")}</p>
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
          <h1 className="text-xl font-semibold text-foreground mb-2">{t("report.not_found")}</h1>
          <p className="text-muted-foreground">{error || t("report.invalid_link")}</p>
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
            <p className="text-xs text-muted-foreground">{t("report.shared_title")}</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col overflow-hidden p-6">
        {/* Question */}
        {report.question && report.question !== report.title && (
          <div className="mb-4 p-3 bg-secondary/30 rounded-lg border border-border/30">
            <p className="text-sm text-muted-foreground">{t("report.question")}</p>
            <p className="text-foreground">{report.question}</p>
          </div>
        )}

        {/* Chart */}
        {report.chart && report.chart.type !== "none" && report.data && report.data.length > 0 && (
          <div className="mb-4 rounded-lg border border-border/30 bg-secondary/5 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <ChartIcon size={14} className="text-primary" />
                {report.chart.title || t("visualization.chart")}
              </span>
            </div>
            <div className="h-[350px]">
              <Chart config={report.chart} data={report.data} height={350} />
            </div>
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
          {t("report.generated_with")}
        </p>
      </footer>
    </div>
  );
}
