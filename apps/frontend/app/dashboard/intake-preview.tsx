"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

type IntakePreviewProps = {
  photos: string[];
  t: Record<string, string>;
};

export function IntakePreview({ photos, t }: IntakePreviewProps) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const hasPhotos = photos.length > 0;
  const hasMultiple = photos.length > 1;
  const src = hasPhotos ? photos[index] : "";

  useEffect(() => {
    setFailed(false);
  }, [index, src]);

  if (!hasPhotos) {
    return <div className="intake-image intake-image-placeholder">{t.noPhoto}</div>;
  }

  if (failed) {
    return <div className="intake-image intake-image-placeholder">{t.photoUnavailable}</div>;
  }

  return (
    <div
      className="intake-media"
      onTouchStart={(event) => {
        setTouchStartX(event.changedTouches[0]?.clientX ?? null);
      }}
      onTouchEnd={(event) => {
        if (!hasMultiple || touchStartX == null) {
          return;
        }
        const endX = event.changedTouches[0]?.clientX ?? touchStartX;
        const delta = endX - touchStartX;
        if (Math.abs(delta) < 24) {
          return;
        }
        if (delta < 0) {
          setIndex((prev) => (prev + 1) % photos.length);
          return;
        }
        setIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
      }}
    >
      <a href={src} target="_blank" rel="noreferrer" title="Open full photo">
        <Image
          className="intake-image"
          src={src}
          alt="Intake preview"
          width={140}
          height={105}
          unoptimized
          onError={() => setFailed(true)}
        />
      </a>
      {hasMultiple ? (
        <>
          <button
            type="button"
            className="intake-nav intake-nav-left"
            aria-label="Previous photo"
            onClick={() => setIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1))}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="intake-nav intake-nav-right"
            aria-label="Next photo"
            onClick={() => setIndex((prev) => (prev + 1) % photos.length)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <div className="intake-media-dots" aria-hidden="true">
            {photos.map((photo, photoIndex) => (
              <span
                key={`${photo}-${photoIndex}`}
                className={`intake-media-dot${photoIndex === index ? " intake-media-dot-active" : ""}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
