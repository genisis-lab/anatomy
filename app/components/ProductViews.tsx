"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  Compass,
  LibraryBig,
  NotebookPen,
  Route,
  Search,
  Target,
  X,
} from "lucide-react";
import type { Organ, OrganId } from "../lib/anatomy-data";
import { buildReviewQueue, type LearnerState, type ReviewTarget, type ViewId } from "../lib/learning";
import { OrganArt } from "./OrganArt";

type SelectOrgan = (organId: OrganId) => void;

export function SystemsView({ organs, onSelectOrgan, onStartPathway }: { organs: Organ[]; onSelectOrgan: SelectOrgan; onStartPathway: (system: string) => void }) {
  const groups = useMemo(() => {
    const result = new Map<string, Organ[]>();
    organs.forEach((organ) => result.set(organ.system, [...(result.get(organ.system) ?? []), organ]));
    return [...result.entries()];
  }, [organs]);

  return (
    <section className="product-view systems-view" aria-labelledby="systems-title">
      <header className="view-heading">
        <div><span>Body atlas</span><h1 id="systems-title">See how organs work together</h1><p>Move from one specimen to the system that supports it, then return to the 3D model with more context.</p></div>
        <strong>{groups.length} systems</strong>
      </header>
      <div className="system-grid">
        {groups.map(([system, items]) => (
          <article key={system}>
            <header><span>{items.length} {items.length === 1 ? "organ" : "organs"}</span><h2>{system}</h2></header>
            <div className="system-organ-list">
              {items.map((organ) => (
                <button key={organ.id} onClick={() => onSelectOrgan(organ.id)}>
                  <span className="organ-glyph"><OrganArt organ={organ} asset="thumb" alt="" size={56} /></span>
                  <span><b>{organ.name}</b><small>{organ.function}</small></span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
            <button className="system-pathway-button" onClick={() => onStartPathway(system)}>
              <Route size={16} /> {items.length > 1 ? "Follow this system" : "Study in body context"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LessonsView({
  organs,
  learner,
  onSelectOrgan,
  onStartLesson,
  onStartQuiz,
  onResumeLesson,
  onReview,
}: {
  organs: Organ[];
  learner: LearnerState;
  onSelectOrgan: SelectOrgan;
  onStartLesson: (organId: OrganId) => void;
  onStartQuiz: (organId: OrganId) => void;
  onResumeLesson: (organId: OrganId, step: number) => void;
  onReview: (target: ReviewTarget) => void;
}) {
  const completed = learner.completedLessons.length;
  const reviewQueue = buildReviewQueue(organs, learner);
  const resumeOrgan = organs.find((organ) => typeof learner.lessonProgress[organ.id] === "number" && !learner.completedLessons.includes(organ.id));
  const recentOrgan = organs.find((organ) => organ.id === learner.recentOrgans[0]);
  return (
    <section className="product-view lessons-view" aria-labelledby="lessons-title">
      <header className="view-heading">
        <div><span>Study path</span><h1 id="lessons-title">Learn one organ at a time</h1><p>Each guided lesson connects location, landmarks, function, and clinical context, then checks recall.</p></div>
        <div className="progress-summary"><strong>{completed}/{organs.length}</strong><span>lessons complete</span></div>
      </header>
      {(resumeOrgan || reviewQueue.length > 0 || recentOrgan) && (
        <section className="study-next" aria-label="Continue learning">
          <div>
            <span>Continue learning</span>
            <h2>{resumeOrgan ? `Resume ${resumeOrgan.name}` : reviewQueue.length ? "Review what needs another look" : `Return to ${recentOrgan?.name}`}</h2>
            <p>{resumeOrgan ? `Continue at step ${(learner.lessonProgress[resumeOrgan.id] ?? 0) + 1} of 4.` : reviewQueue.length ? `${reviewQueue.length} focused review ${reviewQueue.length === 1 ? "item is" : "items are"} ready.` : "Pick up from your most recent specimen."}</p>
          </div>
          <button onClick={() => resumeOrgan
            ? onResumeLesson(resumeOrgan.id, learner.lessonProgress[resumeOrgan.id] ?? 0)
            : reviewQueue[0]
              ? onReview(reviewQueue[0])
              : recentOrgan && onSelectOrgan(recentOrgan.id)}>
            {resumeOrgan ? "Resume lesson" : reviewQueue.length ? "Start focused review" : "Open specimen"}<ArrowRight size={16} />
          </button>
        </section>
      )}
      {reviewQueue.length > 0 && (
        <div className="review-queue" aria-label="Review queue">
          {reviewQueue.map((target, index) => {
            const item = organs.find((organ) => organ.id === target.organId)!;
            const hotspot = item.hotspots.find((entry) => entry.id === target.hotspotId);
            return <button key={`${target.organId}-${target.hotspotId ?? "quiz"}-${index}`} onClick={() => onReview(target)}>
              <Target size={15} /><span><b>{item.name}</b><small>{hotspot ? hotspot.label : "Knowledge check"} · {Math.round(target.accuracy * 100)}%</small></span>
            </button>;
          })}
        </div>
      )}
      <div className="lesson-grid">
        {organs.map((organ, index) => {
          const isComplete = learner.completedLessons.includes(organ.id);
          const score = learner.quizScores[organ.id];
          return (
            <article key={organ.id}>
              <button className="lesson-art" onClick={() => onSelectOrgan(organ.id)} aria-label={`Explore ${organ.name}`}>
                <OrganArt organ={organ} asset="organ" alt="" />
              </button>
              <div className="lesson-card-copy">
                <span>Lesson {String(index + 1).padStart(2, "0")}</span>
                <h2>{organ.name}</h2>
                <p>{organ.description}</p>
                <div className="lesson-status">
                  <span className={isComplete ? "complete" : ""}>{isComplete ? <Check size={14} /> : <BookOpen size={14} />}{isComplete ? "Complete" : "Ready"}</span>
                  {typeof score === "number" && <span>Best quiz {score}/3</span>}
                </div>
                <div className="lesson-card-actions">
                  <button onClick={() => onStartLesson(organ.id)}>{isComplete ? "Review lesson" : "Start lesson"}</button>
                  <button onClick={() => onStartQuiz(organ.id)}>Take quiz</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function LibraryView({
  organs,
  learner,
  query,
  system,
  savedOnly,
  onQuery,
  onSystem,
  onSavedOnly,
  onSelectOrgan,
  onToggleBookmark,
}: {
  organs: Organ[];
  learner: LearnerState;
  query: string;
  system: string;
  savedOnly: boolean;
  onQuery: (value: string) => void;
  onSystem: (value: string) => void;
  onSavedOnly: (value: boolean) => void;
  onSelectOrgan: SelectOrgan;
  onToggleBookmark: (organId: OrganId) => void;
}) {
  const systems = [...new Set(organs.map((organ) => organ.system))];
  const results = organs.filter((organ) => {
    const matchesQuery = `${organ.name} ${organ.system} ${organ.function}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!system || organ.system === system) && (!savedOnly || learner.bookmarks.includes(organ.id));
  });
  return (
    <section className="product-view library-view" aria-labelledby="library-title">
      <header className="view-heading">
        <div><span>Specimen library</span><h1 id="library-title">Find an organ or topic</h1><p>Search by organ, body system, or function. Save specimens you want to revisit.</p></div>
        <strong>{results.length} shown</strong>
      </header>
      <div className="library-toolbar">
        <label><Search size={17} /><span className="sr-only">Search the organ library</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search organs, systems, functions" /></label>
        <label><span className="sr-only">Filter by body system</span><select value={system} onChange={(event) => onSystem(event.target.value)}><option value="">All systems</option>{systems.map((item) => <option key={item}>{item}</option>)}</select></label>
        <button className={savedOnly ? "active" : ""} onClick={() => onSavedOnly(!savedOnly)} aria-pressed={savedOnly}><Bookmark size={16} fill={savedOnly ? "currentColor" : "none"} /> Saved</button>
      </div>
      {results.length ? (
        <div className="library-grid">
          {results.map((organ) => {
            const saved = learner.bookmarks.includes(organ.id);
            return (
              <article key={organ.id}>
                <button className="library-art" onClick={() => onSelectOrgan(organ.id)}><OrganArt organ={organ} asset="organ" alt={`${organ.name} anatomical illustration`} /></button>
                <div><span>{organ.system}</span><h2>{organ.name}</h2><p>{organ.function}</p></div>
                <button className="bookmark-button" onClick={() => onToggleBookmark(organ.id)} aria-label={`${saved ? "Remove" : "Save"} ${organ.name}`} aria-pressed={saved}><Bookmark size={17} fill={saved ? "currentColor" : "none"} /></button>
                <button className="open-organ" onClick={() => onSelectOrgan(organ.id)}>Open specimen <ArrowRight size={15} /></button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state"><Search size={24} /><h2>No matching organs</h2><p>Clear a filter or try a broader function such as “digestion.”</p><button onClick={() => { onQuery(""); onSystem(""); onSavedOnly(false); }}>Show every organ</button></div>
      )}
    </section>
  );
}

export function NotesView({
  organs,
  organ,
  learner,
  syncStatus,
  onSelectOrgan,
  onNote,
  onNoteSaved,
  selectedStructure,
  onStructure,
  onStructureNote,
  onStructureBookmark,
}: {
  organs: Organ[];
  organ: Organ;
  learner: LearnerState;
  syncStatus: string;
  onSelectOrgan: SelectOrgan;
  onNote: (organId: OrganId, note: string) => void;
  onNoteSaved: (organId: OrganId) => void;
  selectedStructure: string | null;
  onStructure: (hotspotId: string | null) => void;
  onStructureNote: (organId: OrganId, hotspotId: string, note: string) => void;
  onStructureBookmark: (hotspotId: string) => void;
}) {
  const note = learner.notes[organ.id] ?? "";
  const structure = organ.hotspots.find((hotspot) => hotspot.id === selectedStructure) ?? null;
  const structureNote = structure ? learner.structureNotes[organ.id]?.[structure.id] ?? "" : "";
  return (
    <section className="product-view notes-view" aria-labelledby="notes-title">
      <header className="view-heading">
        <div><span>Study notebook</span><h1 id="notes-title">Keep the ideas you want to remember</h1><p>Your private notes and progress are saved to this browser’s anonymous learner profile.</p></div>
        <span className={`sync-status ${syncStatus}`}>{syncStatus === "saving" ? "Saving" : syncStatus === "offline" ? "Saved locally, reconnect to sync" : "Saved"}</span>
      </header>
      <div className="notes-layout">
        <aside aria-label="Choose an organ for notes">
          {organs.map((item) => (
            <button key={item.id} className={item.id === organ.id ? "active" : ""} onClick={() => onSelectOrgan(item.id)}>
              <OrganArt organ={item} asset="thumb" alt="" size={42} /><span><b>{item.name}</b><small>{learner.notes[item.id]?.trim() ? "Has notes" : "No notes yet"}</small></span>
            </button>
          ))}
        </aside>
        <article>
          <header><div><span>{organ.system}</span><h2>{organ.name} notes</h2></div><NotebookPen size={21} /></header>
          <div className="note-scope" role="tablist" aria-label="Note scope">
            <button role="tab" aria-selected={!structure} className={!structure ? "active" : ""} onClick={() => onStructure(null)}>Whole organ</button>
            {organ.hotspots.map((hotspot) => <button role="tab" aria-selected={structure?.id === hotspot.id} className={structure?.id === hotspot.id ? "active" : ""} key={hotspot.id} onClick={() => onStructure(hotspot.id)}>{hotspot.label}{learner.structureNotes[organ.id]?.[hotspot.id]?.trim() ? " ·" : ""}</button>)}
          </div>
          {structure ? (
            <>
              <div className="structure-note-context"><Target size={16} /><span><b>{structure.label}</b><small>{structure.detail}</small></span><button type="button" className={(learner.structureBookmarks[organ.id] ?? []).includes(structure.id) ? "saved" : ""} aria-pressed={(learner.structureBookmarks[organ.id] ?? []).includes(structure.id)} onClick={() => onStructureBookmark(structure.id)}><Bookmark size={14} fill={(learner.structureBookmarks[organ.id] ?? []).includes(structure.id) ? "currentColor" : "none"} />{(learner.structureBookmarks[organ.id] ?? []).includes(structure.id) ? "Saved" : "Save"}</button></div>
              <label htmlFor="structure-note">Memory cue for this structure</label>
              <textarea id="structure-note" className="structure-note-field" value={structureNote} onChange={(event) => onStructureNote(organ.id, structure.id, event.target.value)} onBlur={() => onNoteSaved(organ.id)} maxLength={320} placeholder={`Write a concise cue for ${structure.label.toLowerCase()}…`} />
              <footer><span>{structureNote.length.toLocaleString()} / 320</span><small>Saved automatically</small></footer>
            </>
          ) : (
            <>
              <label htmlFor="organ-note">What do you want to remember?</label>
              <textarea id="organ-note" value={note} onChange={(event) => onNote(organ.id, event.target.value)} onBlur={() => onNoteSaved(organ.id)} maxLength={10_000} placeholder={`Write a memory cue, question, or observation about the ${organ.name.toLowerCase()}…`} />
              <footer><span>{note.length.toLocaleString()} / 10,000</span><small>Saved automatically</small></footer>
            </>
          )}
        </article>
      </div>
    </section>
  );
}

export function ProfileDialog({ learner, organs, onClose }: { learner: LearnerState; organs: Organ[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  const average = Object.values(learner.quizScores).filter((value): value is number => typeof value === "number");
  const bestAverage = average.length ? Math.round((average.reduce((sum, value) => sum + value, 0) / (average.length * 3)) * 100) : 0;
  return (
    <dialog ref={ref} className="profile-dialog" onClose={onClose} aria-labelledby="profile-title">
      <button onClick={() => ref.current?.close()} aria-label="Close learner profile"><X size={18} /></button>
      <span>Private learner profile</span><h2 id="profile-title">Your anatomy study</h2><p>Progress is tied to an anonymous browser session. No name or email is collected.</p>
      <dl>
        <div><dt>Lessons complete</dt><dd>{learner.completedLessons.length}/{organs.length}</dd></div>
        <div><dt>Saved organs</dt><dd>{learner.bookmarks.length}</dd></div>
        <div><dt>Saved structures</dt><dd>{Object.values(learner.structureBookmarks).reduce((total, items) => total + (items?.length ?? 0), 0)}</dd></div>
        <div><dt>Quiz accuracy</dt><dd>{bestAverage}%</dd></div>
        <div><dt>Notes</dt><dd>{Object.values(learner.notes).filter((note) => note.trim()).length + Object.values(learner.structureNotes).flatMap((notes) => Object.values(notes ?? {})).filter((note) => note.trim()).length}</dd></div>
      </dl>
      <button className="lesson-button" onClick={() => ref.current?.close()}>Continue studying <ArrowRight size={16} /></button>
    </dialog>
  );
}

export function MobileNav({ active, onChange }: { active: ViewId; onChange: (view: ViewId) => void }) {
  const items: Array<[ViewId, typeof Compass]> = [
    ["explore", Compass],
    ["systems", LibraryBig],
    ["lessons", BookOpen],
    ["library", Search],
    ["notes", NotebookPen],
  ];
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {items.map(([view, Icon]) => <button key={view} className={active === view ? "active" : ""} aria-current={active === view ? "page" : undefined} onClick={() => onChange(view)}><Icon size={18} /><span>{view[0].toUpperCase() + view.slice(1)}</span></button>)}
    </nav>
  );
}
