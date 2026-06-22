import { Download, Filter, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toolbar, ToolbarGroup } from "@/components/ui/toolbar";

export function SofortListToolbar(props: {
  query: string;
  searchPlaceholder: string;
  showFilters: boolean;
  hasActiveFilters: boolean;
  roomFilter: string;
  typeFilter: string;
  listingFilter: string;
  roomOptions: string[];
  typeOptions: string[];
  statusText: string;
  onQueryChange: (value: string) => void;
  onToggleFilters: () => void;
  onRoomFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onListingFilterChange: (value: string) => void;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onReset: () => void;
  labels: {
    allRooms: string;
    allTypes: string;
    allListingStatuses: string;
    listed: string;
    unlisted: string;
    clear: string;
  };
}) {
  const { labels } = props;
  const clearLabel = props.hasActiveFilters ? `${labels.clear} (active)` : labels.clear;

  return (
    <Toolbar className="wh-sofort-toolbar">
      <ToolbarGroup className="wh-sofort-toolbar__search flex-1">
        <Input
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder={props.searchPlaceholder}
          className="wh-input w-full"
          aria-label="Search products"
        />
      </ToolbarGroup>
      <ToolbarGroup className="wh-sofort-toolbar__actions" role="group" aria-label="Sofort list actions">
        <Button type="button" variant="outline" onClick={props.onToggleFilters} className="wh-sofort-toolbar__button">
          <Filter />
          {props.showFilters ? "Hide filters" : "Filters"}
        </Button>
        <Button type="button" variant="outline" onClick={props.onExportCsv} className="wh-sofort-toolbar__button">
          <Download />
          Export CSV
        </Button>
        <Button type="button" variant="outline" onClick={props.onExportExcel} className="wh-sofort-toolbar__button">
          <Download />
          Export XLSX
        </Button>
        <Button type="button" variant="outline" onClick={props.onReset} className="wh-sofort-toolbar__button">
          <Trash2 />
          {clearLabel}
        </Button>
        <Badge variant="outline" className="wh-sofort-toolbar__status">{props.statusText}</Badge>
      </ToolbarGroup>
      {props.showFilters ? (
        <ToolbarGroup className="wh-sofort-toolbar__filters basis-full" role="group" aria-label="Sofort list filters">
          <Select value={props.roomFilter} onValueChange={(value) => props.onRoomFilterChange(value ?? "all")}>
            <SelectTrigger className="wh-select h-10 min-w-[160px]">
              <SelectValue placeholder={labels.allRooms} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.allRooms}</SelectItem>
              {props.roomOptions.map((room) => (
                <SelectItem key={room} value={room}>
                  {room}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={props.typeFilter} onValueChange={(value) => props.onTypeFilterChange(value ?? "all")}>
            <SelectTrigger className="wh-select h-10 min-w-[160px]">
              <SelectValue placeholder={labels.allTypes} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.allTypes}</SelectItem>
              {props.typeOptions.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={props.listingFilter} onValueChange={(value) => props.onListingFilterChange(value ?? "all")}>
            <SelectTrigger className="wh-select h-10 min-w-[160px]">
              <SelectValue placeholder={labels.allListingStatuses} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.allListingStatuses}</SelectItem>
              <SelectItem value="listed">{labels.listed}</SelectItem>
              <SelectItem value="unlisted">{labels.unlisted}</SelectItem>
            </SelectContent>
          </Select>
        </ToolbarGroup>
      ) : null}
    </Toolbar>
  );
}

