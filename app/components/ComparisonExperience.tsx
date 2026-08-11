"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Link2, X } from "lucide-react";
import type { Organ, OrganId } from "../lib/anatomy-data";
import type { AnatomyViewer, ViewerPose } from "../lib/three/viewer";

type Props = {
  organs: Organ[];
  left: Organ;
  right: Organ;
  onLeft: (id: OrganId) => void;
  onRight: (id: OrganId) => void;
  onClose: () => void;
};

function ComparisonStage({ organ, handle, peer, side }: { organ: Organ; handle: MutableRefObject<AnatomyViewer | null>; peer: MutableRefObject<AnatomyViewer | null>; side: "left" | "right" }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<AnatomyViewer | null>(null);
  const organRef = useRef(organ);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let viewer: AnatomyViewer | null = null;
    void import("../lib/three/viewer").then(({ AnatomyViewer: Viewer }) => {
      if (cancelled || !mountRef.current) return;
      viewer = new Viewer(mountRef.current, {
        onLoading: setLoading,
        onSelect: () => {},
        onViewChange: (pose: ViewerPose) => peer.current?.setViewPose(pose),
      });
      const initialOrgan = organRef.current;
      viewer.setCanvasLabel(`${initialOrgan.name} comparison model. Drag either model to rotate both.`);
      viewer.setAutoRotate(false);
      viewerRef.current = viewer;
      handle.current = viewer;
      void viewer.setOrgan(initialOrgan.model, initialOrgan.hotspots, initialOrgan.accent).catch(() => setLoading(false));
    });
    return () => {
      cancelled = true;
      viewerRef.current = null;
      handle.current = null;
      viewer?.dispose();
    };
  }, [handle, peer]);

  useEffect(() => {
    organRef.current = organ;
    if (!viewerRef.current) return;
    viewerRef.current.setCanvasLabel(`${organ.name} comparison model. Drag either model to rotate both.`);
    setLoading(true);
    void viewerRef.current.setOrgan(organ.model, organ.hotspots, organ.accent).catch(() => setLoading(false));
  }, [organ]);

  return (
    <article className="comparison-stage" data-side={side}>
      <header><span>{organ.system}</span><h2>{organ.name}</h2></header>
      <div className="comparison-three-mount" ref={mountRef} />
      {loading && <div className="comparison-loading" role="status">Preparing {organ.name.toLowerCase()}…</div>}
      <div className="comparison-hotspots" aria-label={`${organ.name} structures`}>
        {organ.hotspots.map((hotspot) => <button key={hotspot.id} onClick={() => viewerRef.current?.selectHotspot(hotspot.id)}>{hotspot.label}</button>)}
      </div>
    </article>
  );
}

export function ComparisonExperience({ organs, left, right, onLeft, onRight, onClose }: Props) {
  const leftViewer = useRef<AnatomyViewer | null>(null);
  const rightViewer = useRef<AnatomyViewer | null>(null);
  const rows = [
    ["Primary role", left.function, right.function],
    ["Location", left.location, right.location],
    ["Scale", left.size, right.size],
    ["Tissue focus", left.tissue, right.tissue],
  ];

  return (
    <section className="comparison-experience" aria-label="Synchronized 3D organ comparison">
      <header className="comparison-experience-heading">
        <div><span><Link2 size={14} /> Synchronized 3D comparison</span><h1>Compare form, scale, and function</h1><p>Drag either specimen to move both views together. Select a structure to inspect it in place.</p></div>
        <button onClick={onClose} aria-label="Close comparison"><X size={18} /></button>
      </header>
      <div className="comparison-selectors visual">
        <label><span>First organ</span><select value={left.id} onChange={(event) => onLeft(event.target.value as OrganId)}>{organs.map((organ) => <option key={organ.id} value={organ.id}>{organ.name}</option>)}</select></label>
        <b>with</b>
        <label><span>Second organ</span><select value={right.id} onChange={(event) => onRight(event.target.value as OrganId)}>{organs.filter((organ) => organ.id !== left.id).map((organ) => <option key={organ.id} value={organ.id}>{organ.name}</option>)}</select></label>
      </div>
      <div className="comparison-stages">
        <ComparisonStage organ={left} handle={leftViewer} peer={rightViewer} side="left" />
        <ComparisonStage organ={right} handle={rightViewer} peer={leftViewer} side="right" />
      </div>
      <div className="comparison-table visual">
        {rows.map(([label, leftValue, rightValue]) => <div key={label}><strong>{label}</strong><span>{leftValue}</span><span>{rightValue}</span></div>)}
      </div>
    </section>
  );
}
