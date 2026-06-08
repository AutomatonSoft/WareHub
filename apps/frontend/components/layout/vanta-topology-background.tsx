"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    VANTA?: {
      WAVES: (options: Record<string, unknown>) => { destroy?: () => void };
    };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.loaded = "false";
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export function VantaTopologyBackground() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const effectRef = useRef<{ destroy?: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/three@0.134.0/build/three.min.js");
        await loadScript("https://cdn.jsdelivr.net/npm/vanta@0.5.24/dist/vanta.waves.min.js");

        if (cancelled || !containerRef.current || !window.VANTA?.WAVES) {
          return;
        }

        effectRef.current = window.VANTA.WAVES({
          el: containerRef.current,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          scale: 1,
          scaleMobile: 1,
          color: 0x007a55,
          shininess: 43,
          waveHeight: 18,
          waveSpeed: 0.9,
          zoom: 0.65
        });
      } catch {
        // Decorative background only.
      }
    };

    init();

    return () => {
      cancelled = true;
      effectRef.current?.destroy?.();
      effectRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
}
