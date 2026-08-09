import type { Organ } from "../lib/anatomy-data";
import { ProceduralOrganArt } from "./ProceduralOrganArt";

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
    return <ProceduralOrganArt organ={organ} asset={asset} alt={alt} />;
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
