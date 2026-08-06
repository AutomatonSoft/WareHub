"use client";

import { useState } from "react";
import { useLabels } from "../../app/use-labels";
import { WAREHOUSE_MAP_VIEWBOX, warehouseMapZones } from "./warehouse-map.constants";
import type { WarehouseZone } from "./warehouse-map.types";

export function WarehouseMapCanvas({ onZoneSelect }: { onZoneSelect?: (zone: WarehouseZone) => void }) {
  const t = useLabels();
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  const selectZone = (zone: WarehouseZone) => {
    setSelectedZoneId(zone.id);
    onZoneSelect?.(zone);
  };

  const fontSizeForZone = (zone: WarehouseZone) => {
    if (zone.id === "A") return 58;
    if (zone.id === "C") return 32;
    if (["B", "D", "E", "F"].includes(zone.id)) return 48;
    return 42;
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-[20px] border border-[#e1e5e9] bg-white">
      <svg viewBox={WAREHOUSE_MAP_VIEWBOX} preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="warehouse-map-title warehouse-map-description" className="block size-full select-none">
        <title id="warehouse-map-title">{t.warehouseLayoutMap}</title>
        <desc id="warehouse-map-description">{t.warehouseLayoutMapDescription}</desc>
        <g>
          <rect x="60" y="80" width="1000" height="640" rx="26" fill="#F8FAFB" stroke="#667487" strokeWidth="7" />
          <rect x="1300" y="80" width="760" height="640" rx="26" fill="#F8FAFB" stroke="#667487" strokeWidth="7" />
          <path d="M 1190 245 V 720" stroke="#E8EDF2" strokeWidth="40" strokeLinecap="round" />
          <path d="M 1190 415 V 302" stroke="#168D89" strokeWidth="6" strokeLinecap="round" />
          <path d="M 1169 325 L 1190 302 L 1211 325" fill="none" stroke="#168D89" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="1135" y="104" width="110" height="126" rx="16" fill="#FFF1C7" stroke="#B9892F" strokeWidth="3" />
          {warehouseMapZones.map((zone) => {
            const selected = selectedZoneId === zone.id;
            const fontSize = fontSizeForZone(zone);
            return (
              <g key={zone.id} role="button" tabIndex={0} aria-label={t.selectWarehouseZone.replace("{zone}", `${zone.label}${zone.name ? `, ${zone.name.toLowerCase()}` : ""}`)} onClick={() => selectZone(zone)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectZone(zone); } }} className="cursor-pointer outline-none">
                {zone.shape === "path" && zone.path ? (
                  <path d={zone.path} fill={zone.color} stroke={selected ? "#168D89" : "white"} strokeWidth={selected ? 8 : 5} strokeLinejoin="round" className="transition-opacity duration-200 hover:opacity-85" />
                ) : (
                  <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx={zone.rx ?? 6} fill={zone.color} stroke={selected ? "#168D89" : "white"} strokeWidth={selected ? 8 : 5} className="transition-opacity duration-200 hover:opacity-85" />
                )}
                <text x={zone.textX} y={zone.name ? zone.textY - 24 : zone.textY} textAnchor="middle" dominantBaseline="middle" pointerEvents="none" fill="#202938" fontSize={fontSize} fontWeight="700">{zone.label}</text>
                {zone.name ? <text x={zone.textX} y={zone.textY + 28} textAnchor="middle" dominantBaseline="middle" pointerEvents="none" fill="#202938" fontSize="23" fontWeight="700" letterSpacing="0.5">{zone.name}</text> : null}
              </g>
            );
          })}
          <g fill="#f8fafb" stroke="#aeb8c3" strokeWidth="1">
            {Array.from({ length: 4 }, (_, row) => Array.from({ length: 2 }, (_, column) => <rect key={`a-${row}-${column}`} x={760 + column * 138} y={104 + row * 45} width="138" height="45" />))}
            {Array.from({ length: 2 }, (_, row) => Array.from({ length: 5 }, (_, column) => <rect key={`right-${row}-${column}`} x={1594 + column * 88.4} y={529 + row * 83.5} width="88.4" height="83.5" />))}
          </g>
        </g>
      </svg>
    </div>
  );
}
