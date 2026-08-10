import { createLocalizedMetadata, LocalizedPage } from "../components/LocalizedPage";

export const generateMetadata = () => createLocalizedMetadata("ko");

export default function Page() {
  return <LocalizedPage code="ko" />;
}
