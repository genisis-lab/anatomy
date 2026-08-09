"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, X } from "lucide-react";
import type { Organ } from "../lib/anatomy-data";
import { anatomySources, lessonSteps, quizQuestions } from "../lib/learning";
import { OrganArt } from "./OrganArt";

export type LearningDialogType = "lesson" | "quiz" | "animation" | "system";

type Props = {
  type: LearningDialogType;
  organ: Organ;
  organs: Organ[];
  onClose: () => void;
  onLessonComplete: () => void;
  onQuizComplete: (score: number) => void;
};

export function LearningDialog({ type, organ, organs, onClose, onLessonComplete, onQuizComplete }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [lessonStep, setLessonStep] = useState(0);
  const [lessonComplete, setLessonComplete] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [quizComplete, setQuizComplete] = useState(false);
  const steps = useMemo(() => lessonSteps(organ), [organ]);
  const questions = useMemo(
    () => quizQuestions(organ, organs.filter((item) => item.id !== organ.id).slice(0, 2)),
    [organ, organs],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = () => dialogRef.current?.close();
  const title = type === "quiz"
    ? `${organ.name} quick quiz`
    : type === "animation"
      ? `${organ.name} in motion`
      : type === "system"
        ? `${organ.name} in the body`
        : `Inside the ${organ.name.toLowerCase()}`;

  const finishLesson = () => {
    onLessonComplete();
    setLessonComplete(true);
  };

  const chooseAnswer = (index: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    if (index === questions[questionIndex].correctAnswer) setScore((current) => current + 1);
  };

  const nextQuestion = () => {
    if (questionIndex === questions.length - 1) {
      onQuizComplete(score);
      setQuizComplete(true);
      return;
    }
    setQuestionIndex((current) => current + 1);
    setSelectedAnswer(null);
  };

  const retryQuiz = () => {
    setQuestionIndex(0);
    setSelectedAnswer(null);
    setScore(0);
    setQuizComplete(false);
  };

  return (
    <dialog ref={dialogRef} className="learning-dialog" aria-labelledby="learning-dialog-title" onClose={onClose}>
      <section className={`learning-modal ${type === "system" ? "wide" : ""}`}>
        <button className="modal-close" onClick={close} aria-label="Close"><X size={18} /></button>

        {type === "lesson" && !lessonComplete && (
          <>
            <div className="lesson-progress" aria-label={`Lesson step ${lessonStep + 1} of ${steps.length}`}>
              <span style={{ width: `${((lessonStep + 1) / steps.length) * 100}%` }} />
            </div>
            <em>{steps[lessonStep].eyebrow}</em>
            <h2 id="learning-dialog-title">{steps[lessonStep].title}</h2>
            <p>{steps[lessonStep].body}</p>
            <div className="modal-demo"><OrganArt organ={organ} asset={lessonStep === 3 ? "microscopic" : "organ"} alt={`${organ.name} study illustration`} /></div>
            <ul className="lesson-points">
              {steps[lessonStep].points.map((point) => <li key={point}>{point}</li>)}
            </ul>
            {lessonStep === steps.length - 1 && (
              <div className="source-links" aria-label="Study sources">
                {anatomySources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label}</a>)}
              </div>
            )}
            <div className="modal-actions">
              <button className="secondary-action" onClick={() => setLessonStep((current) => Math.max(0, current - 1))} disabled={lessonStep === 0}>
                <ArrowLeft size={16} /> Back
              </button>
              {lessonStep < steps.length - 1 ? (
                <button className="lesson-button" onClick={() => setLessonStep((current) => current + 1)}>Next step <ArrowRight size={16} /></button>
              ) : (
                <button className="lesson-button" onClick={finishLesson}>Complete lesson <Check size={16} /></button>
              )}
            </div>
          </>
        )}

        {type === "lesson" && lessonComplete && (
          <div className="completion-state" role="status">
            <span className="modal-icon"><Check size={24} /></span>
            <em>Progress saved</em>
            <h2 id="learning-dialog-title">Lesson complete</h2>
            <p>You connected the {organ.name.toLowerCase()}’s structure, location, function, and clinical context.</p>
            <button className="lesson-button" onClick={close}>Return to the specimen <ArrowRight size={16} /></button>
          </div>
        )}

        {type === "quiz" && !quizComplete && (
          <>
            <div className="lesson-progress" aria-label={`Quiz question ${questionIndex + 1} of ${questions.length}`}>
              <span style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} />
            </div>
            <em>Question {questionIndex + 1} of {questions.length}</em>
            <h2 id="learning-dialog-title">{title}</h2>
            <p className="quiz-prompt">{questions[questionIndex].prompt}</p>
            <div className="quiz-options">
              {questions[questionIndex].answers.map((answer, index) => {
                const isCorrect = index === questions[questionIndex].correctAnswer;
                const state = selectedAnswer === null ? "" : isCorrect ? "correct" : selectedAnswer === index ? "incorrect" : "muted";
                return <button key={answer} className={state} onClick={() => chooseAnswer(index)} disabled={selectedAnswer !== null}>{answer}</button>;
              })}
            </div>
            {selectedAnswer !== null && (
              <div className={`answer-feedback ${selectedAnswer === questions[questionIndex].correctAnswer ? "correct" : "incorrect"}`} role="status">
                <strong>{selectedAnswer === questions[questionIndex].correctAnswer ? "Correct" : "Not quite"}</strong>
                <span>{questions[questionIndex].explanation}</span>
              </div>
            )}
            <button className="lesson-button" onClick={nextQuestion} disabled={selectedAnswer === null}>
              {questionIndex === questions.length - 1 ? "See results" : "Next question"}<ArrowRight size={16} />
            </button>
          </>
        )}

        {type === "quiz" && quizComplete && (
          <div className="completion-state" role="status">
            <span className="quiz-score">{score}/{questions.length}</span>
            <em>Quiz complete</em>
            <h2 id="learning-dialog-title">{score === questions.length ? "Excellent recall" : "Keep building the pattern"}</h2>
            <p>Your best score is saved with this organ.</p>
            <div className="modal-actions">
              <button className="secondary-action" onClick={retryQuiz}><RotateCcw size={16} /> Try again</button>
              <button className="lesson-button" onClick={close}>Return to study <ArrowRight size={16} /></button>
            </div>
          </div>
        )}

        {type === "animation" && (
          <>
            <span className="modal-icon">▶</span>
            <em>Function sequence</em>
            <h2 id="learning-dialog-title">{title}</h2>
            <p>Watch the specimen pulse while you follow the three ideas that organize its work.</p>
            <div className="modal-demo moving"><OrganArt organ={organ} asset="organ" alt={`${organ.name} animated study illustration`} /></div>
            <ol className="motion-sequence">
              <li><span>1</span><b>Input</b><small>{organ.bloodSupply}</small></li>
              <li><span>2</span><b>Work</b><small>{organ.function}</small></li>
              <li><span>3</span><b>Daily scale</b><small>{organ.dailyFact}</small></li>
            </ol>
            <button className="lesson-button" onClick={close}>Continue exploring <ArrowRight size={16} /></button>
          </>
        )}

        {type === "system" && (
          <>
            <span className="modal-icon">⌖</span>
            <em>{organ.system}</em>
            <h2 id="learning-dialog-title">{title}</h2>
            <p>{organ.location}. Trace how the {organ.name.toLowerCase()} connects to the rest of the body.</p>
            <figure className="modal-figure"><OrganArt organ={organ} asset="location" alt={`${organ.name} shown within the ${organ.system.toLowerCase()}`} /></figure>
            <dl className="modal-facts">
              <div><dt>System</dt><dd>{organ.system}</dd></div>
              <div><dt>Primary role</dt><dd>{organ.function}</dd></div>
              <div><dt>Blood supply</dt><dd>{organ.bloodSupply}</dd></div>
            </dl>
            <button className="lesson-button" onClick={close}>Continue exploring <ArrowRight size={16} /></button>
          </>
        )}
      </section>
    </dialog>
  );
}
