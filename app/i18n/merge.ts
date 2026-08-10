import { organs as baseOrgans, type Hotspot, type Organ } from "../lib/anatomy-data";
import type { OrganContentDictionary } from "./types";

export type { Hotspot, Organ };

/** Merge translated prose over the complete 21-specimen atlas. Content not
 * yet translated remains useful English instead of disappearing. */
export function buildOrgans(content: OrganContentDictionary): Organ[] {
  return baseOrgans.map((organ) => {
    const prose = content[organ.id];
    if (!prose) return organ;
    return {
      ...organ,
      ...prose,
      hotspots: organ.hotspots.map((hotspot) => ({
        ...hotspot,
        label: prose.hotspots[hotspot.id]?.label ?? hotspot.label,
        detail: prose.hotspots[hotspot.id]?.detail ?? hotspot.detail,
      })),
    };
  });
}

export function indexOrgans(items: Organ[]): Record<Organ["id"], Organ> {
  return Object.fromEntries(items.map((organ) => [organ.id, organ])) as Record<Organ["id"], Organ>;
}

