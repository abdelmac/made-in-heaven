import { LaunchInformationPage, launchPageMetadata } from '@/components/launch-information';

export function generateMetadata() {
  return launchPageMetadata('privacy');
}

export default function PrivacyPage() {
  return <LaunchInformationPage page="privacy" />;
}
