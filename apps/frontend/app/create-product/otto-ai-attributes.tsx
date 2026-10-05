"use client";

import { useEffect, useRef, useState } from "react";
import { useLabels } from "../use-labels";
import { Button } from "../../components/ui/button";
import { suggestOttoAttributes } from "./otto-categories-api";
import { applyOttoAttributeSuggestions, buildOttoPayloadAttributes } from "./otto-create-product-model.mjs";
import type { OttoCreateProductDraft } from "./otto-create-product-panel";

type Props = {
  categoryId: string;
  draftKey: string;
  draft: OttoCreateProductDraft;
  sourceProduct?: Record<string, unknown>;
  productAttributes: unknown;
  onChange: (draft: OttoCreateProductDraft) => void;
};

export function OttoAiAttributes(props: Props) {
  const t = useLabels();
  const latest = useRef(props);
  latest.current = props;
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const generate = async () => {
    if (loading || !props.categoryId) return;
    const identity = `${props.draftKey}:${props.categoryId}`;
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const suggestions = await suggestOttoAttributes(props.categoryId, {
        source: props.sourceProduct ?? {},
        draft: {
          productLine: props.draft.productLine,
          description: props.draft.description,
          bulletPoints: props.draft.bulletPoints,
          attributes: buildOttoPayloadAttributes({ productAttributes: props.productAttributes, ...props.draft }),
        },
      });
      const current = latest.current;
      if (!mounted.current || `${current.draftKey}:${current.categoryId}` !== identity) return;
      const result = applyOttoAttributeSuggestions(current.draft, current.productAttributes, suggestions);
      current.onChange(result.draft);
      setMessage(t.ottoAiResult.replace("{count}", String(result.applied)));
    } catch (caught) {
      if (mounted.current && `${latest.current.draftKey}:${latest.current.categoryId}` === identity) {
        setError(caught instanceof Error ? caught.message : t.ottoAiFailed);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  return <div className="space-y-2">
    <Button type="button" variant="outline" disabled={loading || !props.categoryId} onClick={() => void generate()}>
      {loading ? t.ottoAiLoading : t.ottoAiFill}
    </Button>
    <p className="text-xs text-muted-foreground">{props.categoryId ? t.ottoAiHint : t.ottoSelectCategoryFirst}</p>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </div>;
}
