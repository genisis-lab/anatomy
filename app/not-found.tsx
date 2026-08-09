import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <span>404 · Specimen not found</span>
      <h1>This path is not in the atlas.</h1>
      <p>Return to the organ library and keep exploring the structures that are available.</p>
      <Link href="/?view=library"><Search size={17} /> Open the organ library</Link>
      <Link href="/"><ArrowLeft size={15} /> Return home</Link>
    </main>
  );
}
