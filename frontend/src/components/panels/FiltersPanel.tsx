"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { FilterIcon } from "@/components/icons";
import { t } from "@/hooks/useTranslation";

export interface Filters {
  dateStart: string;
  dateEnd: string;
  noteMin: string;
  noteMax: string;
}

interface FiltersPanelProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export function FiltersPanel({ filters, onFiltersChange }: FiltersPanelProps) {
  const [showFilters, setShowFilters] = useState(false);

  const { dateStart, dateEnd, noteMin, noteMax } = filters;

  const setDateStart = (v: string) => onFiltersChange({ ...filters, dateStart: v });
  const setDateEnd = (v: string) => onFiltersChange({ ...filters, dateEnd: v });
  const setNoteMin = (v: string) => onFiltersChange({ ...filters, noteMin: v });
  const setNoteMax = (v: string) => onFiltersChange({ ...filters, noteMax: v });

  const resetFilters = () => {
    onFiltersChange({ dateStart: "", dateEnd: "", noteMin: "", noteMax: "" });
  };

  const activeFiltersCount = [dateStart, dateEnd, noteMin, noteMax].filter(Boolean).length;

  return (
    <div className="px-3 pb-3">
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <FilterIcon size={16} className={`transition-transform ${showFilters ? "rotate-180" : ""}`} />
        {t("common.filters")}
        {activeFiltersCount > 0 && (
          <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
            {activeFiltersCount}
          </span>
        )}
      </button>

      {showFilters && (
        <div className="mt-3 p-3 bg-secondary/30 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("filters.date_start")}</label>
              <Input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("filters.date_end")}</label>
              <Input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("filters.note_min")}</label>
              <select
                value={noteMin}
                onChange={(e) => setNoteMin(e.target.value)}
                className="w-full h-8 text-sm rounded-md border border-input bg-background px-3"
              >
                <option value="">{t("common.all")}</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("filters.note_max")}</label>
              <select
                value={noteMax}
                onChange={(e) => setNoteMax(e.target.value)}
                className="w-full h-8 text-sm rounded-md border border-input bg-background px-3"
              >
                <option value="">{t("common.all")}</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={resetFilters}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("filters.reset")}
            </button>
            <div className="text-xs text-muted-foreground">
              {t("filters.apply_hint")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
