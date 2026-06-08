import type { ProductEditorGroupId } from "./product-editor-types";

export const PRODUCT_EDITOR_TAB_COPY: Record<ProductEditorGroupId, { label: string; subtitle: string; tabStatus: string }> = {
  JV: { label: "JV", subtitle: "JVMOEBEL source sites through Orchestrator, without JV_MAIN.", tabStatus: "Next" },
  XL: { label: "XL", subtitle: "Read-only placeholder for now.", tabStatus: "Planned" },
  HOOD: { label: "HOOD", subtitle: "MVP-first tab through the new orchestrator flow.", tabStatus: "Active" },
  OTTO: { label: "OTTO", subtitle: "Planned / read-only.", tabStatus: "Planned" },
  KAUFLAND: { label: "KAUFLAND", subtitle: "Planned / read-only.", tabStatus: "Planned" },
  EBAY: { label: "EBAY", subtitle: "Unsupported / planned.", tabStatus: "Unsupported" }
};

export const PRODUCT_EDITOR_PLACEHOLDER_DETAILS: Record<Exclude<ProductEditorGroupId, "JV" | "HOOD">, string[]> = {
  XL: [
    "XL remains visible so the page scales to the full target matrix.",
    "Source-site inspection is allowed, but editing and apply stay disabled in this phase.",
    "This prevents promising full XL editing before the orchestrator flow is ready."
  ],
  OTTO: [
    "OTTO targets are intentionally shown as planned marketplace accounts.",
    "No Product Editor draft or apply controls are exposed here yet."
  ],
  KAUFLAND: [
    "Kaufland remains read-only in Product Editor until a safe orchestrator-controlled flow is added.",
    "Direct create/change/delete actions are intentionally absent here."
  ],
  EBAY: [
    "Ebay is still unsupported in runtime and remains visible only as a roadmap placeholder.",
    "No editing or apply actions can be triggered from this tab."
  ]
};
