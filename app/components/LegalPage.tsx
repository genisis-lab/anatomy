import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: Array<{ title: string; body: string }> }) {
  return (
    <main className="legal-page">
      <Link href="/"><ArrowLeft size={17} /> Back to Anatomy Atelier</Link>
      <span>BuiltWAI · Anatomy Atelier</span>
      <h1>{title}</h1>
      <p>{intro}</p>
      <div>
        {sections.map((section) => <section key={section.title}><h2>{section.title}</h2><p>{section.body}</p></section>)}
      </div>
      <small>Effective August 8, 2026</small>
    </main>
  );
}
