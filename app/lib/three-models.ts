import type { Hotspot, Organ } from "./anatomy-data";
import manifest from "./three-models.json";

/** Hotspot copy for a Three.js specimen. The model build supplies each
 *  hotspot's position and the named mesh it sits on. */
export type HotspotContent = Omit<Hotspot, "position" | "meshName">;

/** Learning content for a specimen built by scripts/three-anatomy. */
export type SpecimenContent = Omit<Organ, "model" | "hotspots"> & { hotspots: HotspotContent[] };

type ModelRecord = {
  model: string;
  anchors: Record<string, { meshName: string; position: number[] }>;
};

const models = manifest as Record<string, ModelRecord>;

/** Colours cycle through the atlas palette so hotspots stay distinguishable. */
export const HOTSPOT_PALETTE = ["#ee7c6a", "#f2a33b", "#6393d8", "#d89bc4", "#7fa88a", "#c7ad86", "#b46ab0", "#4fa3a5"];

export function spots(...entries: Array<[id: string, label: string, detail: string]>): HotspotContent[] {
  return entries.map(([id, label, detail], index) => ({ id, label, detail, color: HOTSPOT_PALETTE[index % HOTSPOT_PALETTE.length] }));
}

/** Joins authored content with its built model: URL, hotspot anchors and the
 *  mesh each hotspot snaps to. */
export function withThreeModel(content: SpecimenContent): Organ {
  const record = models[content.id];
  return {
    ...content,
    model: record?.model ?? "",
    hotspots: content.hotspots.map((hotspot) => {
      const anchor = record?.anchors[hotspot.id];
      return {
        ...hotspot,
        meshName: anchor?.meshName,
        position: (anchor?.position ?? [0, 0, 0.6]) as [number, number, number],
      };
    }),
  };
}
