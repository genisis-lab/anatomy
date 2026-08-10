import { createLocalizedMetadata, LocalizedPage } from "../components/LocalizedPage";

export const generateMetadata = () => createLocalizedMetadata("es");

export default function Page() {
  return <LocalizedPage code="es" />;
}
