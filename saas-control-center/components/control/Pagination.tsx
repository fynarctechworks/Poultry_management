import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Server-rendered offset paginator. Preserves existing query params and swaps the
// page key (default 'page'; pass a unique key when a screen has two paginators).
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
  pageKey = 'page',
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
  pageKey?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set(pageKey, String(p));
    return `${basePath}?${sp.toString()}`;
  };

  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  const navBtn = 'inline-flex items-center gap-xs h-8 px-md rounded-lg text-sm font-semibold border';
  const enabled = 'border-mute text-body hover:bg-mute-soft';
  const disabled = 'border-mute text-body-soft opacity-50 pointer-events-none';

  return (
    <div className="flex items-center justify-between gap-md mt-md">
      <p className="text-xs text-body-soft tabular-nums">
        {from}–{to} of {total.toLocaleString('en-IN')}
      </p>
      <div className="flex items-center gap-sm">
        <Link href={href(current - 1)} className={`${navBtn} ${current <= 1 ? disabled : enabled}`} aria-disabled={current <= 1}>
          <ChevronLeft size={14} /> Prev
        </Link>
        <span className="text-xs text-body-soft tabular-nums">
          Page {current} / {pageCount}
        </span>
        <Link href={href(current + 1)} className={`${navBtn} ${current >= pageCount ? disabled : enabled}`} aria-disabled={current >= pageCount}>
          Next <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}

// Parse a 1-based page number from a search param, clamped to >= 1.
export function parsePage(value: string | undefined): number {
  const n = parseInt(value ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
