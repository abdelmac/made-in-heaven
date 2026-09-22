import { LaunchInformationPage, launchPageMetadata } from '@/components/launch-information';

export function generateMetadata() {
  return launchPageMetadata('legal');
}

export default function LegalPage() {
  return <LaunchInformationPage page="legal" />;
}
