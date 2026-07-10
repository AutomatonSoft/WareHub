import { Button } from "../button";
import { useLabels } from "@/app/use-labels";

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
  const t = useLabels();

  return (
    <div className="ui-table-footer">
      <div className="text-sm text-[color:var(--text-secondary)]">{pageSizeText ?? ""}</div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={onPrev}
          disabled={!hasPrevPage}
          aria-label={t.goToPreviousPage}
          variant="secondary"
          className="h-8 rounded-xl px-3 text-[color:var(--text-primary)]"
        >
          {t.previous}
        </Button>
        <p aria-live="polite" className="min-w-[100px] text-center text-sm text-[color:var(--text-secondary)]">{t.page} {page}</p>
        <Button
          type="button"
          onClick={onNext}
          disabled={!hasNextPage}
          aria-label={t.goToNextPage}
          variant="secondary"
          className="h-8 rounded-xl px-3 text-[color:var(--text-primary)]"
        >
          {t.next}
        </Button>
      </div>
    </div>
  );
}
