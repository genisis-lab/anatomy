import type { CSSProperties, ReactNode } from "react";
import type { Organ, OrganId } from "../lib/anatomy-data";

type Asset = "thumb" | "organ" | "microscopic" | "compare" | "location";

const locationByOrgan: Partial<Record<OrganId, [number, number, number]>> = {
  stomach: [100, 92, 0.25],
  skeleton: [100, 102, 0.78],
  muscles: [100, 102, 0.78],
  ear: [126, 51, 0.19],
  "spinal-cord": [100, 92, 0.52],
  bladder: [100, 137, 0.2],
  thyroid: [100, 59, 0.18],
  lymphatic: [100, 103, 0.65],
  "female-reproductive": [100, 135, 0.23],
  "male-reproductive": [100, 137, 0.23],
  gallbladder: [91, 92, 0.17],
  "airway-diaphragm": [100, 92, 0.48],
};

function HumanOutline() {
  return (
    <g className="body-outline">
      <circle cx="100" cy="34" r="16" />
      <path d="M78 55 Q100 46 122 55 L135 110 119 153 113 188 101 188 98 153 94 188 82 188 78 151 65 110Z" />
      <path d="M75 61 49 111M125 61l26 50" />
    </g>
  );
}

function SpecimenShape({ id }: { id: OrganId }) {
  switch (id) {
    case "stomach":
      return <g><path d="M83 36c5 20 5 31-2 43-12 20-13 48 6 66 19 18 48 12 57-10 8-20-3-36-19-41-13-5-15-17-13-33l-1-25-28 0Z" /><path className="detail" d="M111 37c-3 30 4 49 24 60M82 78c19 1 30 10 32 28" /></g>;
    case "skeleton":
      return <g className="line-specimen"><circle className="filled" cx="100" cy="28" r="19" /><path d="M93 49v73m14-73v73M72 62q28-18 56 0M69 75q31-21 62 0M72 88q28-19 56 0M80 120l-20 55m40-55-14 62m14-62 14 62m6-62 20 55M75 112q25 16 50 0" /></g>;
    case "muscles":
      return <g><ellipse cx="100" cy="31" rx="17" ry="20" /><path d="M77 56q23-14 46 0l12 49-18 27-7 51H92l-4-51-18-27Z" /><ellipse className="detail-fill" cx="67" cy="86" rx="10" ry="31" transform="rotate(14 67 86)" /><ellipse className="detail-fill" cx="133" cy="86" rx="10" ry="31" transform="rotate(-14 133 86)" /><path className="detail" d="M100 55v70M78 75q22 12 44 0M83 99q17 10 34 0M88 130l-12 49m36-49 12 49" /></g>;
    case "ear":
      return <g><path d="M122 30c-39-8-68 20-65 60 3 42 28 26 29 54 1 18 29 22 39 4 8-14-2-27 12-45 27-35 9-67-15-73Zm-5 32c13 10 6 29-6 37-11 8-2 28-14 31-12 3-18-13-11-24 8-13 1-23 7-35 5-10 15-15 24-9Z" /><path className="detail" d="M107 67c-12 9-13 22-5 31 5 6 2 15-4 21" /></g>;
    case "spinal-cord":
      return <g className="line-specimen"><path className="filled" d="M92 23h16l5 125-13 32-13-32Z" /><path d="M100 34v117M91 48 61 61m48-13 30 13M90 70 58 84m52-14 32 14M89 94l-33 14m55-14 33 14M88 120l-28 14m52-14 28 14M91 149l-18 24m36-24 18 24" /></g>;
    case "bladder":
      return <g><path d="M73 73c-10 19-13 56 2 75 14 18 36 20 51 3 18-20 13-58 2-78-13-23-43-23-55 0Z" /><path className="detail" d="M79 74 61 31m60 43 18-43M100 158v27M82 113q18 16 36 0" /></g>;
    case "thyroid":
      return <g><ellipse cx="76" cy="98" rx="29" ry="56" transform="rotate(12 76 98)" /><ellipse cx="124" cy="98" rx="29" ry="56" transform="rotate(-12 124 98)" /><rect x="72" y="89" width="56" height="20" rx="10" /><path className="detail" d="M100 37v126" /></g>;
    case "lymphatic":
      return <g className="line-specimen"><path d="M100 28v140M100 60 65 88m35-8 36 29m-36 18-37 32m37-52 39 40" /><ellipse className="filled" cx="139" cy="72" rx="22" ry="40" transform="rotate(24 139 72)" />{[[100,42],[78,78],[123,94],[100,115],[71,142],[132,145],[100,166]].map(([cx,cy])=><circle className="node" key={`${cx}-${cy}`} cx={cx} cy={cy} r="8" />)}</g>;
    case "female-reproductive":
      return <g><path d="M77 67c5-14 41-14 46 0 5 15 1 50-9 65-5 8-7 22-7 36H93c0-14-2-28-7-36-10-15-14-50-9-65Z" /><path className="detail" d="M79 73C61 55 47 56 33 69m88 4c18-18 32-17 46-4M33 69l-11 15m145-15 11 15M100 74v72" /><ellipse cx="24" cy="88" rx="15" ry="10" /><ellipse cx="176" cy="88" rx="15" ry="10" /></g>;
    case "male-reproductive":
      return <g><ellipse cx="100" cy="76" rx="31" ry="22" /><ellipse cx="73" cy="145" rx="20" ry="30" /><ellipse cx="127" cy="145" rx="20" ry="30" /><path d="M76 88c-7 27 4 34 7 50h34c3-16 14-23 7-50-13 7-35 7-48 0Z" /><path className="detail" d="M79 135C53 100 62 58 83 45m38 90c26-35 17-77-4-90M100 98v81" /></g>;
    case "gallbladder":
      return <g><path d="M89 33c2 20-5 34-15 50-13 21-20 53-5 76 12 18 37 17 50 0 16-22 8-51-7-70-11-15-13-31-7-56Z" /><path className="detail" d="M96 35c16 8 22 20 38 24m-46 31c18 19 24 42 16 67" /></g>;
    case "airway-diaphragm":
      return <g className="line-specimen"><path className="filled airway" d="M84 24h19v76H84z" /><path d="M93 100 64 130m29-30 30 30M115 24v91" /><ellipse className="filled organ-left" cx="60" cy="114" rx="31" ry="45" /><ellipse className="filled organ-right" cx="130" cy="114" rx="31" ry="45" /><path className="diaphragm" d="M35 151q60-43 125 0" /><path className="detail" d="M85 39h18M85 53h18M85 67h18M85 81h18" /></g>;
    default:
      return <circle cx="100" cy="100" r="52" />;
  }
}

function TissuePattern({ id }: { id: OrganId }) {
  return (
    <g>
      <rect className="tissue-field" x="18" y="18" width="164" height="164" rx="28" />
      {[[42,45,15],[78,36,11],[119,43,16],[157,58,10],[51,92,12],[91,83,18],[140,97,14],[39,139,10],[78,151,16],[121,139,11],[158,146,15]].map(([cx, cy, r]) => (
        <g key={`${cx}-${cy}`}><circle className="cell" cx={cx} cy={cy} r={r} /><circle className="nucleus" cx={cx + 2} cy={cy - 1} r={Math.max(3, r / 3)} /></g>
      ))}
      <g transform="translate(65 65) scale(.35)"><SpecimenShape id={id} /></g>
    </g>
  );
}

function VariantArt({ id, asset }: { id: OrganId; asset: Asset }): ReactNode {
  if (asset === "microscopic") return <TissuePattern id={id} />;
  if (asset === "compare") {
    return <g><g transform="translate(-12 28) scale(.72)"><SpecimenShape id={id} /></g><g className="compare-echo" transform="translate(88 65) scale(.48)"><SpecimenShape id={id} /></g><path className="comparison-line" d="M101 35v130" /></g>;
  }
  if (asset === "location") {
    const [x, y, scale] = locationByOrgan[id] ?? [100, 100, 0.3];
    return <g><HumanOutline /><g className="location-highlight" transform={`translate(${x - 100 * scale} ${y - 100 * scale}) scale(${scale})`}><SpecimenShape id={id} /></g></g>;
  }
  return <SpecimenShape id={id} />;
}

export function ProceduralOrganArt({ organ, asset, alt }: { organ: Organ; asset: Asset; alt: string }) {
  const labelling = alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true };
  return (
    <svg
      className={`procedural-art procedural-art-${asset}`}
      viewBox="0 0 200 200"
      style={{ "--organ-art-accent": organ.accent } as CSSProperties}
      {...labelling}
    >
      <VariantArt id={organ.id} asset={asset} />
    </svg>
  );
}

