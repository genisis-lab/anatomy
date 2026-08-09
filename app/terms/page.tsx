import type { Metadata } from "next";
import { LegalPage } from "../components/LegalPage";

export const metadata: Metadata = { title: "Terms · Anatomy Atelier" };

export default function TermsPage() {
  return <LegalPage title="Terms of use" intro="Anatomy Atelier is an educational reference for exploring normal human anatomy." sections={[
    { title: "Educational use", body: "The site does not provide medical diagnosis, treatment, or professional advice. Seek qualified medical care for health questions or symptoms." },
    { title: "Content", body: "We aim to present accurate, approachable anatomy information and link to educational references. Medical knowledge changes, so verify material required for clinical or academic decisions against your institution’s approved sources." },
    { title: "Acceptable use", body: "You may use the site for personal study and teaching demonstrations. Do not disrupt the service, automate abusive traffic, or attempt to access another browser’s study data." },
    { title: "Availability", body: "Features may change as the learning experience develops. We do not guarantee uninterrupted availability or that every 3D feature will work on unsupported hardware." },
  ]} />;
}
