"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Filter, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldGrid } from "@/components/ui/field-grid";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolbarGroup } from "@/components/ui/toolbar";

type SelectOption = { value: string; label: string };

function SearchableFilterField(props: {
  label: string;
  ariaLabel: string;
  value: string;
  placeholder: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  const selectedLabel = props.options.find((option) => option.value === props.value)?.label ?? props.placeholder;
  const filteredOptions = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return props.options;
    return props.options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [props.options, search]);

  return (
    <div className="wh-sofort-filter-field">
      <span className="wh-sofort-filter-field__label">{props.label}</span>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="wh-sofort-filter-trigger w-full justify-between"
              aria-label={props.ariaLabel}
            >
              <span className="truncate">{selectedLabel}</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          }
        />
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          style={{ width: "var(--anchor-width)", minWidth: "var(--anchor-width)", maxWidth: "var(--anchor-width)" }}
          className="wh-sofort-filter-menu w-[var(--radix-anchor-width)] min-w-[var(--radix-anchor-width)] rounded-xl border border-border bg-popover p-2 shadow-[var(--wh-shadow-popover)]"
        >
          <div className="wh-sofort-filter-menu__search" onClick={(event) => event.stopPropagation()}>
            <Search className="size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${props.label.toLowerCase()}`}
              aria-label={`Search ${props.label}`}
              className="wh-sofort-filter-menu__input"
            />
          </div>
          <div className="wh-sofort-filter-menu__list">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const active = option.value === props.value;
                return (
                  <DropdownMenuItem
                    key={`${props.label}-${option.value || "all"}`}
                    className="wh-sofort-filter-menu__item"
                    closeOnClick
                    onClick={() => props.onValueChange(option.value)}
                  >
                    <span className="truncate">{option.label}</span>
                    {active ? <Check className="ml-auto size-4 text-primary" /> : null}
                  </DropdownMenuItem>
                );
              })
            ) : (
              <div className="wh-sofort-filter-menu__empty">No matches</div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type SofortListToolbarLabels = {
  allPlaces: string;
  allLocations: string;
  allQuantities: string;
  allRooms: string;
  allTypes: string;
  allCompanies: string;
  allColors: string;
  allMaterials: string;
  allListingStatuses: string;
  listed: string;
  unlisted: string;
  place: string;
  location: string;
  quantity: string;
  room: string;
  type: string;
  company: string;
  color: string;
  material: string;
  listing: string;
  warehouse: string;
  store: string;
  clear: string;
};

export function SofortListToolbar(props: {
  query: string;
  queryLabel: string;
  searchPlaceholder: string;
  primaryAction?: ReactNode;
  showFilters: boolean;
  hasActiveFilters: boolean;
  placeFilter: string;
  locationFilter: string;
  quantityFilter: string;
  roomFilter: string;
  typeFilter: string;
  companyFilter: string;
  colorFilter: string;
  materialFilter: string;
  listingFilter: string;
  placeOptions: string[];
  quantityOptions: string[];
  roomOptions: string[];
  typeOptions: string[];
  companyOptions: string[];
  colorOptions: string[];
  materialOptions: string[];
  activeFilters: Array<{ key: string; label: string; value: string }>;
  statusText: string;
  onQueryChange: (value: string) => void;
  onToggleFilters: () => void;
  onPlaceFilterChange: (value: string) => void;
  onLocationFilterChange: (value: string) => void;
  onQuantityFilterChange: (value: string) => void;
  onRoomFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onCompanyFilterChange: (value: string) => void;
  onColorFilterChange: (value: string) => void;
  onMaterialFilterChange: (value: string) => void;
  onListingFilterChange: (value: string) => void;
  onClearSingleFilter: (key: string) => void;
  onReset: () => void;
  labels: SofortListToolbarLabels;
}) {
  void props.activeFilters;
  void props.onClearSingleFilter;

  const { labels } = props;
  const clearLabel = props.hasActiveFilters ? `${labels.clear} (active)` : labels.clear;

  const locationOptions: SelectOption[] = [
    { value: "all", label: labels.allLocations },
    { value: "warehouse", label: labels.warehouse },
    { value: "store", label: labels.store },
  ];
  const listingOptions: SelectOption[] = [
    { value: "all", label: labels.allListingStatuses },
    { value: "listed", label: labels.listed },
    { value: "unlisted", label: labels.unlisted },
  ];
  const placeOptions = [{ value: "all", label: labels.allPlaces }, ...props.placeOptions.map((value) => ({ value, label: value }))];
  const quantityOptions = [{ value: "all", label: labels.allQuantities }, ...props.quantityOptions.map((value) => ({ value, label: value }))];
  const roomOptions = [{ value: "all", label: labels.allRooms }, ...props.roomOptions.map((value) => ({ value, label: value }))];
  const typeOptions = [{ value: "all", label: labels.allTypes }, ...props.typeOptions.map((value) => ({ value, label: value }))];
  const companyOptions = [{ value: "all", label: labels.allCompanies }, ...props.companyOptions.map((value) => ({ value, label: value }))];
  const colorOptions = [{ value: "all", label: labels.allColors }, ...props.colorOptions.map((value) => ({ value, label: value }))];
  const materialOptions = [{ value: "all", label: labels.allMaterials }, ...props.materialOptions.map((value) => ({ value, label: value }))];

  return (
    <div className="wh-sofort-toolbar">
      <div className="wh-sofort-toolbar__top">
        <ToolbarGroup className="wh-sofort-toolbar__search" role="search">
          <div className="grid w-full gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{props.queryLabel}</span>
            <Input
              value={props.query}
              onChange={(event) => props.onQueryChange(event.target.value)}
              placeholder={props.searchPlaceholder}
              className="wh-input w-full"
              aria-label="Search products"
            />
          </div>
        </ToolbarGroup>
        <ToolbarGroup className="wh-sofort-toolbar__actions" role="group" aria-label="Sofort list actions">
          {props.primaryAction ? <div className="wh-sofort-toolbar__primary-action">{props.primaryAction}</div> : null}
          <Button type="button" variant="outline" onClick={props.onToggleFilters} className="wh-sofort-toolbar__button">
            <Filter />
            {props.showFilters ? "Hide filters" : "Filters"}
          </Button>
          <Button type="button" variant="outline" onClick={props.onReset} className="wh-sofort-toolbar__button">
            <Trash2 />
            {clearLabel}
          </Button>
          <Badge variant="outline" className="wh-sofort-toolbar__status">
            {props.statusText}
          </Badge>
        </ToolbarGroup>
      </div>
      {props.showFilters ? (
        <div className="wh-sofort-toolbar__filters" role="group" aria-label="Sofort list filters">
          <FieldGrid className="wh-sofort-toolbar__filter-grid">
            <SearchableFilterField
              label={labels.place}
              ariaLabel={labels.place}
              value={props.placeFilter || "all"}
              placeholder={labels.allPlaces}
              onValueChange={props.onPlaceFilterChange}
              options={placeOptions}
            />
            <SearchableFilterField
              label={labels.location}
              ariaLabel={labels.location}
              value={props.locationFilter}
              placeholder={labels.allLocations}
              onValueChange={props.onLocationFilterChange}
              options={locationOptions}
            />
            <SearchableFilterField
              label={labels.quantity}
              ariaLabel={labels.quantity}
              value={props.quantityFilter || "all"}
              placeholder={labels.allQuantities}
              onValueChange={props.onQuantityFilterChange}
              options={quantityOptions}
            />
            <SearchableFilterField
              label={labels.room}
              ariaLabel={labels.room}
              value={props.roomFilter || "all"}
              placeholder={labels.allRooms}
              onValueChange={props.onRoomFilterChange}
              options={roomOptions}
            />
            <SearchableFilterField
              label={labels.type}
              ariaLabel={labels.type}
              value={props.typeFilter || "all"}
              placeholder={labels.allTypes}
              onValueChange={props.onTypeFilterChange}
              options={typeOptions}
            />
            <SearchableFilterField
              label={labels.company}
              ariaLabel={labels.company}
              value={props.companyFilter || "all"}
              placeholder={labels.allCompanies}
              onValueChange={props.onCompanyFilterChange}
              options={companyOptions}
            />
            <SearchableFilterField
              label={labels.color}
              ariaLabel={labels.color}
              value={props.colorFilter || "all"}
              placeholder={labels.allColors}
              onValueChange={props.onColorFilterChange}
              options={colorOptions}
            />
            <SearchableFilterField
              label={labels.material}
              ariaLabel={labels.material}
              value={props.materialFilter || "all"}
              placeholder={labels.allMaterials}
              onValueChange={props.onMaterialFilterChange}
              options={materialOptions}
            />
            <SearchableFilterField
              label={labels.listing}
              ariaLabel={labels.listing}
              value={props.listingFilter}
              placeholder={labels.allListingStatuses}
              onValueChange={props.onListingFilterChange}
              options={listingOptions}
            />
          </FieldGrid>
        </div>
      ) : null}
    </div>
  );
}
