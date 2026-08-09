import type { CSSProperties } from "react";
import type { Organ } from "../lib/anatomy-data";

export function OrganArt({
  organ,
  asset,
  alt,
  size,
}: {
  organ: Organ;
  asset: "thumb" | "organ" | "microscopic" | "compare" | "location";
  alt: string;
  size?: number;
}) {
  if (!organ.illustrated) {
    const labelling = alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true };
    return (
      <span className="art-fallback" style={{ "--art-accent": organ.accent } as CSSProperties} {...labelling}>
        {organ.icon}
      </span>
    );
  }
  return (
    // These are pre-sized WebP specimen assets with art-directed variants;
    // the browser can choose eager or lazy loading without a runtime wrapper.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={`${organ.id}-${asset}`}
      src={`/anatomy/${organ.id}/${asset}.webp`}
      alt={alt}
      width={size}
      height={size}
      loading={asset === "thumb" ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
