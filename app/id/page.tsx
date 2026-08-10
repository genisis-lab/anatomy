import { createLocalizedMetadata, LocalizedPage } from "../components/LocalizedPage";

export const generateMetadata = () => createLocalizedMetadata("id");

export default function Page() {
  return <LocalizedPage code="id" />;
}
