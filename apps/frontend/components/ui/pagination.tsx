"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, MoreHorizontalIcon } from "lucide-react"

import { useLabels } from "@/app/use-labels"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  const t = useLabels()
  return <nav aria-label={t.pagination} className={cn("mx-auto flex w-full justify-center", className)} {...props} />
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("flex flex-wrap items-center justify-center gap-1.5", className)} {...props} />
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"
} & React.ComponentProps<"button">

function PaginationLink({ className, isActive, size = "icon-xs", type = "button", ...props }: PaginationLinkProps) {
  return (
    <button
      aria-current={isActive ? "page" : undefined}
      className={cn(
        buttonVariants({
          variant: isActive ? "default" : "outline",
          size,
        }),
        size === "icon-xs" ? "min-w-8 rounded-xl" : "rounded-xl",
        className
      )}
      type={type}
      {...props}
    />
  )
}

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  const t = useLabels()
  return (
    <PaginationLink
      aria-label={t.goToPreviousPage}
      size="icon-xs"
      className={cn("rounded-xl", className)}
      {...props}
    >
      <ChevronLeftIcon className="size-4" />
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  const t = useLabels()
  return (
    <PaginationLink
      aria-label={t.goToNextPage}
      size="icon-xs"
      className={cn("rounded-xl", className)}
      {...props}
    >
      <ChevronRightIcon className="size-4" />
    </PaginationLink>
  )
}

function PaginationFirst({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
  const t = useLabels()
  return (
    <PaginationLink
      aria-label={t.goToFirstPage}
      size="icon-xs"
      className={cn("rounded-xl", className)}
      {...props}
    >
      <ChevronsLeftIcon className="size-4" />
    </PaginationLink>
  )
}

function PaginationLast({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
  const t = useLabels()
  return (
    <PaginationLink
      aria-label={t.goToLastPage}
      size="icon-xs"
      className={cn("rounded-xl", className)}
      {...props}
    >
      <ChevronsRightIcon className="size-4" />
    </PaginationLink>
  )
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  const t = useLabels()
  return (
    <span aria-hidden className={cn("flex size-8 items-center justify-center text-muted-foreground", className)} {...props}>
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">{t.morePages}</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationFirst,
  PaginationLast,
  PaginationNext,
  PaginationPrevious,
}
