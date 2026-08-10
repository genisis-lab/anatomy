import type { Metadata } from "next";
import { getDictionary } from "../i18n/dictionaries";
import { getLocale } from "../i18n/config";
import { AnatomyApp } from "./AnatomyApp";

export async function createLocalizedMetadata(code: string): Promise<Metadata> {
  const locale = getLocale(code);
  const { ui } = await getDictionary(locale.code);
  return {
    title: ui.meta.title,
    description: ui.meta.description,
    openGraph: { title: ui.meta.ogTitle, description: ui.meta.ogDescription, locale: locale.intl },
  };
}

export async function LocalizedPage({ code }: { code: string }) {
  const locale = getLocale(code);
  const dictionary = await getDictionary(locale.code);
  return <AnatomyApp locale={locale} dictionary={dictionary} />;
}
