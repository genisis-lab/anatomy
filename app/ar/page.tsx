import { createLocalizedMetadata, LocalizedPage } from "../components/LocalizedPage";

export const generateMetadata = () => createLocalizedMetadata("ar");

export default function Page() {
  return <LocalizedPage code="ar" />;
}
