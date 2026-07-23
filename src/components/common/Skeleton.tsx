"use client";

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`h-4 bg-gray-200 dark:bg-slate-700 rounded animate-pulse ${className}`} />;
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-900/60 rounded-lg border border-gray-200 dark:border-slate-800 shadow-sm p-6 space-y-4 ${className}`}>
      <SkeletonLine className="w-1/3" />
      <SkeletonLine className="w-2/3" />
      <SkeletonLine className="w-1/2" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white dark:bg-slate-900/60 rounded-lg border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="grid grid-cols-[repeat(5,1fr)] gap-4 p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonLine key={`h-${i}`} className="h-3" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`r-${r}`} className="grid grid-cols-[repeat(5,1fr)] gap-4 p-4 border-b border-gray-100 dark:border-slate-700/50 last:border-0">
          {Array.from({ length: 5 }).map((_, c) => (
            <SkeletonLine key={`c-${r}-${c}`} className={`h-3 ${c === 0 ? "w-3/4" : "w-1/2"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage({ className = "" }: { className?: string }) {
  return (
    <div className={`p-8 space-y-6 ${className}`}>
      <div className="flex items-center justify-between">
        <SkeletonLine className="w-48 h-6" />
        <SkeletonLine className="w-24 h-8" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonTable rows={6} />
    </div>
  );
}

export function SkeletonKpiGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-slate-900/60 rounded-lg border border-gray-200 dark:border-slate-800 shadow-sm p-4 space-y-2">
          <SkeletonLine className="w-16 h-3" />
          <SkeletonLine className="w-24 h-7" />
          <SkeletonLine className="w-12 h-3" />
        </div>
      ))}
    </div>
  );
}
