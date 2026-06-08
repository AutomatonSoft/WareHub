import { Button } from "../button";

type TablePaginationProps = {
  page: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  onPrev: () => void;
  onNext: () => void;
  pageSizeText?: string;
};

export function TablePagination({
  page,
  hasPrevPage,
  hasNextPage,
  onPrev,
  onNext,
  pageSizeText
}: TablePaginationProps) {
  return (
    <div className="ui-table-footer">
      <div className="text-sm text-[color:var(--text-secondary)]">{pageSizeText ?? ""}</div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={onPrev}
          disabled={!hasPrevPage}
          aria-label="Go to previous page"
          variant="secondary"
          className="h-8 rounded-xl px-3 text-[color:var(--text-primary)]"
        >
          Prev
        </Button>
        <p aria-live="polite" className="min-w-[100px] text-center text-sm text-[color:var(--text-secondary)]">Page {page}</p>
        <Button
          type="button"
          onClick={onNext}
          disabled={!hasNextPage}
          aria-label="Go to next page"
          variant="secondary"
          className="h-8 rounded-xl px-3 text-[color:var(--text-primary)]"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
