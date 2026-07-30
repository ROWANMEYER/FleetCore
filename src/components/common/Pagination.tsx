"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-3 py-1.5 text-xs font-medium text-[var(--nav-text-color)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Previous
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`e-${i}`} className="px-2 py-1.5 text-xs text-[var(--nav-text-color)]">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              p === currentPage
                ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white border-transparent"
                : "text-[var(--nav-text-color)] bg-[var(--card-bg)] border-[var(--card-border)] hover:opacity-80"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-3 py-1.5 text-xs font-medium text-[var(--nav-text-color)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}
