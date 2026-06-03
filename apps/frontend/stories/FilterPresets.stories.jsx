import { useState } from "react";
import { FilterPresets } from "../components/shared/table/filter-presets";

export default {
  title: "Shared/FilterPresets",
  component: FilterPresets
};

function Demo() {
  const [state, setState] = useState({
    q: "chair",
    placeSort: "asc"
  });

  return (
    <div className="space-y-3">
      <FilterPresets scope="storybook-filter-presets" current={state} onApply={setState} />
      <p className="text-sm text-[color:var(--text-secondary)]">
        Current: <strong>{JSON.stringify(state)}</strong>
      </p>
    </div>
  );
}

export function DefaultState() {
  return <Demo />;
}
