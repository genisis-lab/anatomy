import { createLocalizedMetadata, LocalizedPage } from "../components/LocalizedPage";

export const generateMetadata = () => createLocalizedMetadata("hi");

export default function Page() {
  return <LocalizedPage code="hi" />;
}
