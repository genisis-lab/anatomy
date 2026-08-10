import { AnatomyApp } from "./components/AnatomyApp";
import { getLocale } from "./i18n/config";
import { getDictionary } from "./i18n/dictionaries";

export default async function Home() {
  const locale = getLocale("en");
  const dictionary = await getDictionary(locale.code);
  return <AnatomyApp locale={locale} dictionary={dictionary} />;
}
