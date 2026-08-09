import type { Metadata } from "next";
import { LegalPage } from "../components/LegalPage";

export const metadata: Metadata = { title: "Privacy · Anatomy Atelier" };

export default function PrivacyPage() {
  return <LegalPage title="Privacy" intro="Anatomy Atelier is designed to support private study without asking for your name, email, or medical information." sections={[
    { title: "What we store", body: "We assign an anonymous browser session so saved organs, study notes, lesson completion, and quiz scores can persist. Notes are limited to the study content you choose to enter. Do not enter personal medical information." },
    { title: "Product analytics", body: "We record anonymous events such as organ selections, lesson completion, quiz scores, and model load failures. These events help improve the learning experience and are not used for advertising." },
    { title: "Cookies", body: "A strictly necessary session cookie connects your browser to its saved study state. It is HTTP only, same site, and cannot be read by page scripts." },
    { title: "Your choices", body: "You can use the anatomy viewer without creating an account. Clearing site data ends the browser’s connection to its anonymous study profile." },
  ]} />;
}
