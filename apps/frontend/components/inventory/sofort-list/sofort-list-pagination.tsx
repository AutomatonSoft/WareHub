import { Fragment } from "react";

import {
  PaginationFirst,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLast,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function buildVisiblePages(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 4) {
    return [1, 2, 3, 4, 5, -1, totalPages];
  }

  if (page >= totalPages - 3) {
    return [1, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, -1, page - 1, page, page + 1, -1, totalPages];
}

export function SofortListPagination(props: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  pageSizeOptions: number[];
  hasPrevPage: boolean;
  hasNextPage: boolean;
  labels: {
    rowsOnPage: string;
    total: string;
    previous: string;
    next: string;
    page: string;
  };
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const visiblePages = buildVisiblePages(props.page, props.totalPages);

  return (
    <div className="wh-sofort-pagination flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap">{props.labels.rowsOnPage}</span>
          <Select
            value={String(props.pageSize)}
            onValueChange={(value) => props.onPageSizeChange(Number.parseInt(value ?? "", 10) || props.pageSize)}
          >
            <SelectTrigger className="h-9 min-w-[96px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.pageSizeOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Pagination className="mx-0 w-full justify-start lg:w-auto lg:justify-end">
        <PaginationContent className="justify-start lg:justify-end">
          <PaginationItem>
            <PaginationFirst
              onClick={() => props.onPageChange(1)}
              disabled={!props.hasPrevPage}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => props.onPageChange(Math.max(1, props.page - 1))}
              disabled={!props.hasPrevPage}
            />
          </PaginationItem>
          {visiblePages.map((visiblePage, index) => {
            return (
              <Fragment key={`${visiblePage}-${index}`}>
                {visiblePage === -1 ? (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem>
                    <PaginationLink isActive={visiblePage === props.page} onClick={() => props.onPageChange(visiblePage)} aria-label={`${props.labels.page} ${visiblePage}`}>
                      {visiblePage}
                    </PaginationLink>
                  </PaginationItem>
                )}
              </Fragment>
            );
          })}
          <PaginationItem>
            <PaginationNext
              onClick={() => props.onPageChange(Math.min(props.totalPages, props.page + 1))}
              disabled={!props.hasNextPage}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationLast
              onClick={() => props.onPageChange(props.totalPages)}
              disabled={!props.hasNextPage}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
