import { LaunchInformationPage, launchPageMetadata } from '@/components/launch-information';

export function generateMetadata() {
  return launchPageMetadata('terms');
}

export default function TermsPage() {
  return <LaunchInformationPage page="terms" />;
}
