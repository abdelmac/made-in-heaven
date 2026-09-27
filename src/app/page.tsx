import { HomePage } from '@/components/home-page';
import { SiteEntry } from '@/components/site-entry';

export default function Page() {
  return <SiteEntry home={<HomePage />} />;
}
