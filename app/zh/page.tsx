import { createLocalizedMetadata, LocalizedPage } from "../components/LocalizedPage";

export const generateMetadata = () => createLocalizedMetadata("zh");

export default function Page() {
  return <LocalizedPage code="zh" />;
}
