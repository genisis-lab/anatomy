import { createLocalizedMetadata, LocalizedPage } from "../components/LocalizedPage";

export const generateMetadata = () => createLocalizedMetadata("fr");

export default function Page() {
  return <LocalizedPage code="fr" />;
}
