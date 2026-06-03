import { CheckCircle2, Download, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SofortListBulkActions(props: {
  selectedCount: number;
  roomOptions: string[];
  typeOptions: string[];
  onSetListed: () => void;
  onSetUnlisted: () => void;
  onExportSelected: () => void;
  onApplyRoom: (value: string) => void;
  onApplyType: (value: string) => void;
  onClearSelection: () => void;
}) {
  const [roomValue, setRoomValue] = useState("");
  const [typeValue, setTypeValue] = useState("");

  if (props.selectedCount < 1) {
    return null;
  }

  return (
    <div className="wh-sofort-bulkbar">
      <span className="wh-sofort-bulkbar__label">{props.selectedCount} selected</span>
      <Button type="button" variant="outline" onClick={props.onSetListed} className="wh-sofort-bulkbar__button">
        <CheckCircle2 />
        Set listed
      </Button>
      <Button type="button" variant="outline" onClick={props.onSetUnlisted} className="wh-sofort-bulkbar__button">
        <XCircle />
        Set unlisted
      </Button>
      <Button type="button" variant="outline" onClick={props.onExportSelected} className="wh-sofort-bulkbar__button">
        <Download />
        Export selected CSV
      </Button>
      <Select
        value={roomValue}
        onValueChange={(value) => {
          setRoomValue("");
          if (value) props.onApplyRoom(value);
        }}
      >
        <SelectTrigger className="wh-select min-w-[150px]">
          <SelectValue placeholder="Bulk room..." />
        </SelectTrigger>
        <SelectContent>
          {props.roomOptions.map((room) => (
            <SelectItem key={`bulk-room-${room}`} value={room}>
              {room}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={typeValue}
        onValueChange={(value) => {
          setTypeValue("");
          if (value) props.onApplyType(value);
        }}
      >
        <SelectTrigger className="wh-select min-w-[150px]">
          <SelectValue placeholder="Bulk type..." />
        </SelectTrigger>
        <SelectContent>
          {props.typeOptions.map((type) => (
            <SelectItem key={`bulk-type-${type}`} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="ghost" onClick={props.onClearSelection} className="wh-sofort-bulkbar__ghost">
        Deselect all
      </Button>
    </div>
  );
}

