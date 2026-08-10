import { createLocalizedMetadata, LocalizedPage } from "../components/LocalizedPage";

export const generateMetadata = () => createLocalizedMetadata("de");

export default function Page() {
  return <LocalizedPage code="de" />;
}
