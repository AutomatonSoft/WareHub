"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import Image from "next/image";

import { useLabels } from "@/app/use-labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ImageGalleryCard(props: { images: string[]; onRemove?: (url: string) => void; className?: string }) {
  const t = useLabels();
  const [activeIndex, setActiveIndex] = useState(0);
  const images = props.images;
  const activeImage = useMemo(() => images[activeIndex] ?? images[0] ?? null, [activeIndex, images]);

  return (
    <Card className={cn("rounded-xl border", props.className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t.gallery}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="relative overflow-hidden rounded-xl border bg-muted">
          {activeImage ? (
            <div className="relative h-64 w-full">
              <Image src={activeImage} alt={t.productNameLabel} fill unoptimized className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">{t.productEditorNoImage}</div>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {images.map((imageUrl, index) => (
            <div key={imageUrl} className="relative">
              <button type="button" onClick={() => setActiveIndex(index)} className={cn("w-full overflow-hidden rounded-xl border", index === activeIndex ? "ring-2 ring-primary" : "")}>
                <div className="relative h-16 w-full">
                  <Image src={imageUrl} alt="" fill unoptimized className="object-cover" sizes="96px" />
                </div>
              </button>
              {props.onRemove ? (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-1 top-1 h-5 w-5"
                  onClick={() => props.onRemove?.(imageUrl)}
                  aria-label={t.productEditorRemoveImageTitle}
                >
                  <X className="size-3" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

