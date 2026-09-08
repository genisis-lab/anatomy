"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import gsap from "gsap";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  BrainCircuit,
  ChevronDown,
  CircleHelp,
  Compass,
  FileText,
  Globe,
  Heart,
  LibraryBig,
  Microscope,
  NotebookPen,
  Play,
  Search,
  Share2,
  Sparkles,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { OrganViewer } from "./OrganViewer";
import type { OrganId } from "../lib/anatomy-data";
import { locales, type LocaleConfig } from "../i18n/config";
import { buildOrgans, indexOrgans } from "../i18n/merge";
import { format, type Dictionary, type UiDictionary } from "../i18n/types";
import { anatomySources, systemPathway, type ReviewTarget, type ViewId } from "../lib/learning";
import { trackLearningEvent, useLearnerState } from "../lib/use-learner-state";
import { LearningDialog, type LearningDialogType } from "./LearningDialog";
import { OrganArt } from "./OrganArt";
import { ComparisonExperience } from "./ComparisonExperience";
import {
  LessonsView,
  LibraryView,
  MobileNav,
  NotesView,
  ProfileDialog,
  SystemsView,
} from "./ProductViews";

const VIEW_IDS = new Set<ViewId>(["explore", "systems", "lessons", "library", "notes"]);

function LanguageSwitcher({ locale, t }: { locale: LocaleConfig; t: UiDictionary }) {
  return (
    <div className="language-switcher" title={t.language.label}>
      <Globe size={16} aria-hidden />
      <span className="language-current">{locale.nativeName}</span>
      <ChevronDown size={14} aria-hidden />
      <select
        aria-label={t.language.choose}
        value={locale.code}
        onChange={(event) => {
          const next = event.target.value;
          const url = new URL(window.location.href);
          const segments = url.pathname.split("/").filter(Boolean);
          if (segments[0] && locales.some((entry) => entry.code === segments[0])) segments[0] = next;
          else segments.unshift(next);
          url.pathname = `/${segments.join("/")}`;
          window.location.assign(`${url.pathname}${url.search}${url.hash}`);
        }}
      >
        {locales.map((entry) => <option key={entry.code} value={entry.code} lang={entry.code}>{entry.nativeName}</option>)}
      </select>
    </div>
  );
}

export function AnatomyApp({ locale, dictionary }: { locale: LocaleConfig; dictionary: Dictionary }) {
  const t = dictionary.ui;
  const organs = useMemo(() => buildOrgans(dictionary.organs), [dictionary.organs]);
  const organById = useMemo(() => indexOrgans(organs), [organs]);
  const [organId, setOrganId] = useState<OrganId>("heart");
  const [view, setView] = useState<ViewId>("explore");
  const [autoRotate, setAutoRotate] = useState(true);
  const [compare, setCompare] = useState(false);
  const [compareId, setCompareId] = useState<OrganId>("brain");
  const [modal, setModal] = useState<LearningDialogType | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [systemFilter, setSystemFilter] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [mobileLibrary, setMobileLibrary] = useState(false);
  const [quizActive, setQuizActive] = useState(false);
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>(null);
  const [lessonStep, setLessonStep] = useState(0);
  const [pathwaySystem, setPathwaySystem] = useState<string | null>(null);
  const [pathwayStep, setPathwayStep] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const mobileLibraryRef = useRef<HTMLElement>(null);
  const prefetched = useRef(new Set<OrganId>());
  const appOpenedTracked = useRef(false);
  const organ = organById[organId];
  const resolvedCompareId = compareId === organId ? (organs.find((item) => item.id !== organId)?.id ?? "heart") : compareId;
  const comparisonOrgan = organById[resolvedCompareId];
  const pathwayOrgans = useMemo(() => pathwaySystem ? systemPathway(pathwaySystem, organs) : [], [organs, pathwaySystem]);
  const { state: learner, updateState, syncStatus } = useLearnerState();
  const filteredOrgans = useMemo(
    () => organs.filter((item) => `${item.name} ${item.system} ${item.function}`.toLocaleLowerCase(locale.code).includes(query.toLocaleLowerCase(locale.code))),
    [locale.code, organs, query],
  );

  useEffect(() => {
    document.documentElement.lang = locale.code;
    document.documentElement.dir = locale.dir;
  }, [locale]);

  const readUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedOrgan = params.get("organ");
    const requestedView = params.get("view");
    const nextOrgan = requestedOrgan && requestedOrgan in organById ? requestedOrgan as OrganId : "heart";
    const nextView = requestedView && VIEW_IDS.has(requestedView as ViewId) ? requestedView as ViewId : "explore";
    const hotspot = params.get("hotspot");
    const comparison = params.get("compare");
    const requestedModal = params.get("learn");
    const pathway = params.get("pathway");
    setOrganId(nextOrgan);
    setView(nextView);
    setSelectedHotspot(hotspot && organById[nextOrgan].hotspots.some((item) => item.id === hotspot) ? hotspot : null);
    setCompare(Boolean(comparison && comparison in organById && comparison !== nextOrgan));
    if (comparison && comparison in organById && comparison !== nextOrgan) setCompareId(comparison as OrganId);
    setModal(requestedModal && ["lesson", "quiz", "animation", "system"].includes(requestedModal) ? requestedModal as LearningDialogType : null);
    setLessonStep(Math.max(0, Math.min(3, Number(params.get("step")) || 0)));
    setQuizActive(params.get("quiz") === "labels");
    setPathwaySystem(pathway && organs.some((item) => item.system === pathway) ? pathway : null);
    setPathwayStep(Math.max(0, Number(params.get("pathStep")) || 0));
  }, [organById, organs]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => {
      setPrefersReducedMotion(motion.matches);
      if (motion.matches) setAutoRotate(false);
    };
    const initialFrame = window.requestAnimationFrame(() => {
      readUrl();
      updateMotion();
    });
    window.addEventListener("popstate", readUrl);
    motion.addEventListener("change", updateMotion);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      window.removeEventListener("popstate", readUrl);
      motion.removeEventListener("change", updateMotion);
    };
  }, [readUrl]);

  useEffect(() => {
    if (syncStatus === "loading" || appOpenedTracked.current) return;
    appOpenedTracked.current = true;
    trackLearningEvent("app_opened");
  }, [syncStatus]);

  useEffect(() => {
    if (!mobileLibrary || !mobileLibraryRef.current) return;
    const panel = mobileLibraryRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')];
    focusable()[0]?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileLibrary(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [mobileLibrary]);

  useEffect(() => {
    if (prefersReducedMotion || !contentRef.current) return;
    gsap.fromTo(
      contentRef.current.querySelectorAll("[data-reveal]"),
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.48, stagger: 0.035, ease: "power2.out", overwrite: true },
    );
  }, [organId, prefersReducedMotion]);

  const writeUrl = (nextView: ViewId, nextOrgan: OrganId, replace = false, extras: { hotspot?: string | null; compare?: OrganId | null; learn?: LearningDialogType | null; step?: number; quiz?: boolean; pathway?: string | null; pathStep?: number } = {}) => {
    const url = new URL(window.location.href);
    if (nextView === "explore") url.searchParams.delete("view");
    else url.searchParams.set("view", nextView);
    if (nextOrgan === "heart") url.searchParams.delete("organ");
    else url.searchParams.set("organ", nextOrgan);
    ["hotspot", "compare", "learn", "step", "quiz", "pathway", "pathStep"].forEach((key) => url.searchParams.delete(key));
    if (extras.hotspot) url.searchParams.set("hotspot", extras.hotspot);
    if (extras.compare) url.searchParams.set("compare", extras.compare);
    if (extras.learn) url.searchParams.set("learn", extras.learn);
    if (extras.learn === "lesson" && typeof extras.step === "number") url.searchParams.set("step", String(extras.step));
    if (extras.quiz) url.searchParams.set("quiz", "labels");
    if (extras.pathway) {
      url.searchParams.set("pathway", extras.pathway);
      url.searchParams.set("pathStep", String(extras.pathStep ?? 0));
    }
    window.history[replace ? "replaceState" : "pushState"]({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const rememberOrgan = (id: OrganId) => {
    updateState((current) => ({
      ...current,
      recentOrgans: [id, ...current.recentOrgans.filter((item) => item !== id)].slice(0, 6),
      lastStudiedAt: { ...current.lastStudiedAt, [id]: Date.now() },
    }));
  };

  const selectOrgan = (id: OrganId, nextView: ViewId = "explore") => {
    if (organById[id].illustrated) {
      (organById[id].specimenOnly ? ["organ"] : ["organ", "microscopic", "compare", "location"]).forEach((asset) => {
        const image = new Image();
        image.src = `/anatomy/${id}/${asset}.webp`;
      });
    }
    setOrganId(id);
    setView(nextView);
    setMobileLibrary(false);
    setCompare(false);
    setQuizActive(false);
    setSelectedHotspot(null);
    setPathwaySystem(null);
    writeUrl(nextView, id);
    rememberOrgan(id);
    trackLearningEvent("organ_selected", id, { view: nextView });
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  };

  const changeView = (nextView: ViewId) => {
    setView(nextView);
    setCompare(false);
    setQuizActive(false);
    setSelectedHotspot(null);
    setPathwaySystem(null);
    setMobileLibrary(false);
    writeUrl(nextView, organId);
    trackLearningEvent("view_changed", organId, { view: nextView });
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  };

  const prefetchOrgan = (id: OrganId) => {
    if (id === organId || prefetched.current.has(id)) return;
    prefetched.current.add(id);
    const model = organById[id].model;
    void fetch(model, { priority: "low" } as RequestInit).catch(() => {});
  };

  const openLearning = (type: LearningDialogType, id: OrganId = organId, requestedStep?: number) => {
    if (id !== organId) {
      setOrganId(id);
    }
    const nextStep = type === "lesson" ? requestedStep ?? learner.lessonProgress[id] ?? 0 : 0;
    setLessonStep(nextStep);
    setModal(type);
    writeUrl(view, id, false, { learn: type, step: nextStep });
    trackLearningEvent(type === "quiz" ? "quiz_started" : type === "lesson" ? "lesson_started" : "view_changed", id, { surface: type });
  };

  const toggleBookmark = (id: OrganId) => {
    updateState((current) => ({
      ...current,
      bookmarks: current.bookmarks.includes(id) ? current.bookmarks.filter((item) => item !== id) : [...current.bookmarks, id],
    }));
    trackLearningEvent("bookmark_toggled", id, { saved: !learner.bookmarks.includes(id) });
  };

  const completeLesson = () => {
    updateState((current) => ({
      ...current,
      completedLessons: current.completedLessons.includes(organId) ? current.completedLessons : [...current.completedLessons, organId],
      lessonProgress: { ...current.lessonProgress, [organId]: 3 },
      lastStudiedAt: { ...current.lastStudiedAt, [organId]: Date.now() },
    }));
    trackLearningEvent("lesson_completed", organId);
  };

  const completeQuiz = (score: number) => {
    updateState((current) => ({
      ...current,
      quizScores: { ...current.quizScores, [organId]: Math.max(score, current.quizScores[organId] ?? 0) },
      quizAttempts: { ...current.quizAttempts, [organId]: [...(current.quizAttempts[organId] ?? []), { mode: "knowledge", score, total: 3, completedAt: Date.now() }].slice(-12) },
      lastStudiedAt: { ...current.lastStudiedAt, [organId]: Date.now() },
    }));
    trackLearningEvent("quiz_completed", organId, { score, total: 3 });
  };

  const saveNote = (id: OrganId, note: string) => {
    updateState((current) => ({ ...current, notes: { ...current.notes, [id]: note } }));
  };

  const saveStructureNote = (id: OrganId, hotspotId: string, note: string) => {
    updateState((current) => ({
      ...current,
      structureNotes: { ...current.structureNotes, [id]: { ...(current.structureNotes[id] ?? {}), [hotspotId]: note } },
      lastStudiedAt: { ...current.lastStudiedAt, [id]: Date.now() },
    }));
  };

  const toggleStructureBookmark = (hotspotId: string) => {
    updateState((current) => {
      const saved = current.structureBookmarks[organId] ?? [];
      return {
        ...current,
        structureBookmarks: {
          ...current.structureBookmarks,
          [organId]: saved.includes(hotspotId) ? saved.filter((id) => id !== hotspotId) : [...saved, hotspotId],
        },
        lastStudiedAt: { ...current.lastStudiedAt, [organId]: Date.now() },
      };
    });
    trackLearningEvent("bookmark_toggled", organId, { hotspotId, saved: !(learner.structureBookmarks[organId] ?? []).includes(hotspotId) });
  };

  const recordLabellingAnswer = (hotspotId: string, correct: boolean) => {
    updateState((current) => {
      const previous = current.structureProgress[organId]?.[hotspotId] ?? { correct: 0, attempts: 0, lastReviewed: 0 };
      return {
        ...current,
        structureProgress: { ...current.structureProgress, [organId]: { ...(current.structureProgress[organId] ?? {}), [hotspotId]: { correct: previous.correct + (correct ? 1 : 0), attempts: previous.attempts + 1, lastReviewed: Date.now() } } },
        lastStudiedAt: { ...current.lastStudiedAt, [organId]: Date.now() },
      };
    });
  };

  const completeLabellingQuiz = (score: number, total: number) => {
    updateState((current) => ({ ...current, quizAttempts: { ...current.quizAttempts, [organId]: [...(current.quizAttempts[organId] ?? []), { mode: "labelling", score, total, completedAt: Date.now() }].slice(-12) } }));
    trackLearningEvent("quiz_completed", organId, { score, total, mode: "labelling" });
  };

  const updateLessonStep = (step: number) => {
    setLessonStep(step);
    updateState((current) => ({ ...current, lessonProgress: { ...current.lessonProgress, [organId]: step }, lastStudiedAt: { ...current.lastStudiedAt, [organId]: Date.now() } }));
    writeUrl(view, organId, true, { learn: "lesson", step });
  };

  const openStructureNote = (hotspotId: string) => {
    setSelectedHotspot(hotspotId);
    setView("notes");
    writeUrl("notes", organId, false, { hotspot: hotspotId });
  };

  const reviewTarget = (target: ReviewTarget) => {
    selectOrgan(target.organId);
    if (target.hotspotId) {
      setSelectedHotspot(target.hotspotId);
      writeUrl("explore", target.organId, true, { hotspot: target.hotspotId });
    } else {
      setQuizActive(true);
      writeUrl("explore", target.organId, true, { quiz: true });
    }
  };

  const startPathway = (system: string) => {
    const items = systemPathway(system, organs);
    if (!items.length) return;
    setPathwaySystem(system);
    setPathwayStep(0);
    setView("explore");
    setOrganId(items[0].id);
    setCompare(false);
    setQuizActive(false);
    setSelectedHotspot(null);
    rememberOrgan(items[0].id);
    writeUrl("explore", items[0].id, false, { pathway: system, pathStep: 0 });
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  };

  const movePathway = (step: number) => {
    const next = Math.max(0, Math.min(pathwayOrgans.length - 1, step));
    const nextOrgan = pathwayOrgans[next];
    if (!nextOrgan) return;
    setPathwayStep(next);
    setOrganId(nextOrgan.id);
    setSelectedHotspot(null);
    rememberOrgan(nextOrgan.id);
    writeUrl("explore", nextOrgan.id, true, { pathway: pathwaySystem, pathStep: next });
  };

  const selectComparisonOrgan = (id: OrganId) => {
    const nextComparison = id === compareId ? (organs.find((item) => item.id !== id)?.id ?? "heart") : compareId;
    if (id === compareId) setCompareId(nextComparison);
    setOrganId(id);
    writeUrl(view, id, true, { compare: nextComparison });
    rememberOrgan(id);
    trackLearningEvent("organ_selected", id, { view: "comparison" });
  };

  const toggleComparison = () => {
    setCompare((current) => !current);
    writeUrl("explore", organId, false, { compare: compare ? null : resolvedCompareId });
    if (!compare) trackLearningEvent("comparison_opened", organId, { reference: resolvedCompareId });
  };

  const navItems: Array<[ViewId, typeof Compass]> = [
    ["systems", BrainCircuit],
    ["lessons", BookOpen],
    ["library", LibraryBig],
    ["notes", NotebookPen],
  ];

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <main className="app-shell" id="main-content">
        <header className="topbar">
          <button className="brand" type="button" onClick={() => selectOrgan("heart")} aria-label={t.brand.home}>
            <strong>Anatomy Atelier<sup>✦</sup></strong>
            <em>{t.brand.tagline}.</em>
          </button>
          <nav className="main-nav" aria-label="Primary navigation">
            {navItems.map(([item, Icon]) => (
              <button key={item} className={view === item ? "active" : ""} onClick={() => changeView(item)} aria-current={view === item ? "page" : undefined}>
                <Icon size={17} /><span>{t.nav[item]}</span>
              </button>
            ))}
          </nav>
          <label className="search-box">
            <Search size={17} />
            <span className="sr-only">{t.search.placeholder}</span>
            <input value={query} onFocus={() => changeView("library")} onChange={(event) => setQuery(event.target.value)} placeholder={t.search.placeholder} />
          </label>
          <LanguageSwitcher locale={locale} t={t} />
          <button
            type="button"
            className={`header-explore ${view === "explore" ? "active" : ""}`}
            aria-current={view === "explore" ? "page" : undefined}
            aria-label={view === "explore" ? t.library.open : t.nav.explore}
            onClick={() => {
              if (view === "explore") setMobileLibrary(true);
              else changeView("explore");
            }}
          >
            <Compass size={17} aria-hidden />
            <span>{t.nav.explore}</span>
          </button>
          <button className="profile" aria-label={t.profile.open} title={t.profile.open} onClick={() => setProfileOpen(true)}>
            <UserRound size={18} aria-hidden />
          </button>
        </header>

        {view === "explore" && (
          <>
            {compare ? (
              <ComparisonExperience
                organs={organs}
                left={organ}
                right={comparisonOrgan}
                onLeft={selectComparisonOrgan}
                onRight={(id) => { setCompareId(id); writeUrl("explore", organId, true, { compare: id }); }}
                onClose={() => { setCompare(false); writeUrl("explore", organId, true); }}
              />
            ) : (
            <>
            <div className="workspace">
              <aside
                ref={mobileLibraryRef}
                className={`organ-library ${mobileLibrary ? "open" : ""}`}
                aria-label={t.library.title}
                role={mobileLibrary ? "dialog" : undefined}
                aria-modal={mobileLibrary ? true : undefined}
              >
                <div className="panel-heading">
                  <span>{t.library.title}</span>
                  <button aria-label={t.library.close} className="mobile-close" onClick={() => setMobileLibrary(false)}><X size={17} /></button>
                  <button aria-label={t.library.saved} onClick={() => { setSavedOnly(true); changeView("library"); }}><Bookmark size={17} /></button>
                </div>
                <label className="drawer-search"><Search size={15} /><span className="sr-only">Search organs</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search organs" /></label>
                <div className="organ-list">
                  {filteredOrgans.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`organ-item ${organId === item.id ? "active" : ""}`}
                      onClick={() => selectOrgan(item.id)}
                      onPointerEnter={() => prefetchOrgan(item.id)}
                      onFocus={() => prefetchOrgan(item.id)}
                      style={{ "--item-accent": item.accent } as CSSProperties}
                    >
                      <span className="organ-glyph"><OrganArt organ={item} asset="thumb" alt={`${item.name} thumbnail`} size={47} /></span>
                      <span><b>{item.name}</b><small>{item.system}</small></span>
                      {learner.bookmarks.includes(item.id) && <Bookmark className="favorite" size={14} fill="currentColor" />}
                    </button>
                  ))}
                </div>
                {!filteredOrgans.length && <div className="drawer-empty">No matching organs</div>}
                <button className="view-all" onClick={() => { setQuery(""); changeView("library"); }}>{t.library.viewAll} <ArrowRight size={14} /></button>
                <blockquote><Sparkles size={18} /><p>{t.library.quoteLine1}<br />{t.library.quoteLine2}</p><em>{t.library.quoteSign}</em></blockquote>
              </aside>

              <OrganViewer
                organ={organ}
                t={t}
                autoRotate={autoRotate}
                onAutoRotate={setAutoRotate}
                compare={compare}
                onCompare={toggleComparison}
                quizActive={quizActive}
                onQuizExit={() => { setQuizActive(false); writeUrl("explore", organId, true, { pathway: pathwaySystem, pathStep: pathwayStep }); }}
                selectedHotspotId={selectedHotspot}
                onHotspotNote={openStructureNote}
                onHotspotBookmark={toggleStructureBookmark}
                isHotspotSaved={(hotspotId) => (learner.structureBookmarks[organId] ?? []).includes(hotspotId)}
                onHotspotSelect={(hotspotId) => { setSelectedHotspot(hotspotId); writeUrl("explore", organId, true, { hotspot: hotspotId, pathway: pathwaySystem, pathStep: pathwayStep }); trackLearningEvent("hotspot_selected", organId, { hotspotId }); }}
                onModelLoad={(durationMs, failed) => trackLearningEvent(failed ? "model_load_failed" : "model_loaded", organId, { durationMs })}
                onQuizAnswer={recordLabellingAnswer}
                onQuizComplete={completeLabellingQuiz}
              />

              <aside className="info-panel" ref={contentRef}>
                <div className="info-kicker" data-reveal><Heart size={13} fill="currentColor" /> {format(t.info.kicker, { organ: organ.name })}</div>
                <div className="info-title-row" data-reveal>
                  <div><h1>{organ.name}</h1><em>{organ.poetic}</em></div>
                  <span className="specimen-stamp"><OrganArt organ={organ} asset="organ" alt={`${organ.name} anatomical illustration`} size={92} /></span>
                </div>
                <p className="description" data-reveal>{organ.description}</p>
                {organ.modelNote && <details className="model-scope"><summary>About this 3D study</summary><p>{organ.modelNote}</p><a href="/model-credits">Model sources and licenses</a></details>}
                <div className="rule" />
                <h2 data-reveal>{t.info.keyFacts}</h2>
                <dl className="key-facts">
                  <div data-reveal><dt><span>◇</span> {t.info.size}</dt><dd>{organ.size}</dd></div>
                  <div data-reveal><dt><span>♙</span> {t.info.weight}</dt><dd>{organ.weight}</dd></div>
                  <div data-reveal><dt><span>⌁</span> {t.info.daily}</dt><dd>{organ.dailyFact}</dd></div>
                  <div data-reveal><dt><span>⌖</span> {t.info.location}</dt><dd>{organ.location}</dd></div>
                  <div data-reveal><dt><span>❋</span> {t.info.bloodSupply}</dt><dd>{organ.bloodSupply}</dd></div>
                  <div data-reveal><dt><span>◈</span> {t.info.function}</dt><dd>{organ.function}</dd></div>
                </dl>
                <div className="medical-note" data-reveal><Stethoscope size={16} /><p><b>{t.info.medical}</b>{organ.medical}</p></div>
                <div className="fun-note" data-reveal><Sparkles size={15} /><p><b>{t.info.didYouKnow}</b>{organ.funFact}</p></div>
                <button className="lesson-button" data-reveal onClick={() => openLearning("lesson")}>{t.info.viewLesson} <ArrowRight size={16} /></button>
                <div className="action-grid" data-reveal>
                  <button onClick={() => openLearning("animation")}><Play size={15} /> {t.info.animate}</button>
                  <button onClick={() => { setQuizActive(true); setSelectedHotspot(null); writeUrl("explore", organId, false, { quiz: true }); trackLearningEvent("quiz_started", organId, { mode: "labelling" }); }}><CircleHelp size={15} /> {t.info.quiz}</button>
                  <button onClick={toggleComparison} className={compare ? "active" : ""} aria-pressed={compare}><Share2 size={15} /> {t.info.compare}</button>
                </div>
                <button className={`save-organ ${learner.bookmarks.includes(organId) ? "saved" : ""}`} onClick={() => toggleBookmark(organId)} aria-pressed={learner.bookmarks.includes(organId)}>
                  <Bookmark size={15} fill={learner.bookmarks.includes(organId) ? "currentColor" : "none"} />{learner.bookmarks.includes(organId) ? "Saved to library" : "Save this organ"}
                </button>
              </aside>
            </div>

            {pathwaySystem && pathwayOrgans.length > 0 && (
              <section className="pathway-guide" aria-label={`${pathwaySystem} guided pathway`}>
                <div className="pathway-progress" aria-hidden><span style={{ width: `${((pathwayStep + 1) / pathwayOrgans.length) * 100}%` }} /></div>
                <div><span>Guided system pathway · {pathwayStep + 1} of {pathwayOrgans.length}</span><h2>{pathwaySystem}</h2><p><b>{organ.name}</b> — {organ.function}. {organ.location}.</p></div>
                <div className="pathway-actions">
                  <button onClick={() => movePathway(pathwayStep - 1)} disabled={pathwayStep === 0}>Previous</button>
                  {pathwayStep < pathwayOrgans.length - 1
                    ? <button className="primary" onClick={() => movePathway(pathwayStep + 1)}>Next specimen <ArrowRight size={15} /></button>
                    : <button className="primary" onClick={() => { setPathwaySystem(null); writeUrl("explore", organId, true); }}>Finish pathway</button>}
                  <button className="pathway-close" onClick={() => { setPathwaySystem(null); writeUrl("explore", organId, true); }} aria-label="Close guided pathway"><X size={16} /></button>
                </div>
              </section>
            )}

            <section className="learning-cards" aria-label={`${organ.name} learning resources`}>
              <article className="curiosity-card"><span>✿</span><p>Learning is<br />an act of curiosity.</p><em>Keep exploring</em></article>
              <article>
                <header><div><em>{organ.specimenOnly ? "Tissue context" : "Microscopic view"}</em><h3>{organ.tissue}</h3></div><Microscope size={17} /></header>
                <div className="microscope-visual organ-card-image"><OrganArt organ={organ} asset="microscopic" alt={`${organ.name} microscopic tissue view`} /></div>
                <button onClick={() => openLearning("lesson")}>Study the tissue <ArrowRight size={14} /></button>
              </article>
              <article>
                <header><div><em>Compare organs</em><h3>{organ.comparison}</h3></div><Share2 size={17} /></header>
                <div className="comparison-visual organ-card-image"><OrganArt organ={organ} asset="compare" alt={`${organ.comparison} anatomical comparison`} /></div>
                <button onClick={toggleComparison}>Choose two organs <ArrowRight size={14} /></button>
              </article>
              <article>
                <header><div><em>Function sequence</em><h3>{organ.function}</h3></div><Play size={17} /></header>
                <button type="button" className="function-visual organ-card-image" onClick={() => openLearning("animation")} aria-label={`Play the ${organ.name.toLowerCase()} function sequence`}>
                  <OrganArt organ={organ} asset="organ" alt="" /><i className="function-pulse" /><span className="play-badge"><Play size={18} fill="currentColor" /></span>
                </button>
                <button onClick={() => openLearning("animation")}>Follow the function <ArrowRight size={14} /></button>
              </article>
              <article>
                <header><div><em>Clinical notes</em><h3>Common conditions</h3></div><FileText size={17} /></header>
                <ul>{organ.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>
                <button onClick={() => openLearning("lesson")}>Study clinical context <ArrowRight size={14} /></button>
              </article>
              <article className="system-card">
                <header><div><em>Where it works</em><h3>{organ.system}</h3></div><BrainCircuit size={17} /></header>
                <button type="button" className="system-visual organ-card-image" onClick={() => openLearning("system")} aria-label={`See where the ${organ.name.toLowerCase()} sits in the body`}><OrganArt organ={organ} asset="location" alt="" /></button>
                <button onClick={() => startPathway(organ.system)}>Follow the whole system <ArrowRight size={14} /></button>
              </article>
            </section>
            </>
            )}
          </>
        )}

        {view === "systems" && <SystemsView organs={organs} onSelectOrgan={selectOrgan} onStartPathway={startPathway} />}
        {view === "lessons" && <LessonsView organs={organs} learner={learner} onSelectOrgan={selectOrgan} onStartLesson={(id) => openLearning("lesson", id)} onStartQuiz={(id) => openLearning("quiz", id)} onResumeLesson={(id, step) => openLearning("lesson", id, step)} onReview={reviewTarget} />}
        {view === "library" && (
          <LibraryView organs={organs} learner={learner} query={query} system={systemFilter} savedOnly={savedOnly} onQuery={setQuery} onSystem={setSystemFilter} onSavedOnly={setSavedOnly} onSelectOrgan={selectOrgan} onToggleBookmark={toggleBookmark} />
        )}
        {view === "notes" && <NotesView organs={organs} organ={organ} learner={learner} syncStatus={syncStatus} onSelectOrgan={(id) => selectOrgan(id, "notes")} onNote={saveNote} onNoteSaved={(id) => trackLearningEvent("note_saved", id)} selectedStructure={selectedHotspot} onStructure={(hotspotId) => { setSelectedHotspot(hotspotId); writeUrl("notes", organId, true, { hotspot: hotspotId }); }} onStructureNote={saveStructureNote} onStructureBookmark={toggleStructureBookmark} />}

        <footer className="site-footer">
          <div><strong>Anatomy Atelier</strong><span>Interactive education, not medical advice.</span></div>
          <nav aria-label="Reference and legal links">
            {anatomySources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label}</a>)}
            <a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://builtwai.com">BuiltWAI</a>
          </nav>
          <small>Content cross-checked against the linked educational references · August 2026</small>
        </footer>

        <MobileNav active={view} onChange={changeView} />
        {modal && <LearningDialog type={modal} organ={organ} organs={organs} initialLessonStep={lessonStep} onLessonStep={updateLessonStep} onClose={() => { setModal(null); writeUrl(view, organId, true); }} onLessonComplete={completeLesson} onQuizComplete={completeQuiz} />}
        {profileOpen && <ProfileDialog learner={learner} organs={organs} onClose={() => setProfileOpen(false)} />}
        {mobileLibrary && <button className="drawer-backdrop" aria-label="Close library" onClick={() => setMobileLibrary(false)} />}
      </main>
    </>
  );
}
