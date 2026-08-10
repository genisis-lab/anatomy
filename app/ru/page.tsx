import { createLocalizedMetadata, LocalizedPage } from "../components/LocalizedPage";

export const generateMetadata = () => createLocalizedMetadata("ru");

export default function Page() {
  return <LocalizedPage code="ru" />;
}
