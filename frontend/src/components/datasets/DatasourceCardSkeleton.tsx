"use client";

export function DatasourceCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary rounded-lg" />
          <div>
            <div className="h-4 w-24 bg-secondary rounded mb-1" />
            <div className="h-3 w-16 bg-secondary rounded" />
          </div>
        </div>
        <div className="h-5 w-20 bg-secondary rounded-full" />
      </div>
      <div className="h-3 w-32 bg-secondary rounded mb-4" />
      <div className="flex gap-2">
        <div className="flex-1 h-8 bg-secondary rounded-lg" />
        <div className="w-8 h-8 bg-secondary rounded-lg" />
      </div>
    </div>
  );
}

interface DatasourceCardSkeletonGridProps {
  count?: number;
}

export function DatasourceCardSkeletonGrid({ count = 2 }: DatasourceCardSkeletonGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <DatasourceCardSkeleton key={i} />
      ))}
    </div>
  );
}
