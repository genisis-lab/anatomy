import { createLocalizedMetadata, LocalizedPage } from "../components/LocalizedPage";

export const generateMetadata = () => createLocalizedMetadata("en");

export default function Page() {
  return <LocalizedPage code="en" />;
}
