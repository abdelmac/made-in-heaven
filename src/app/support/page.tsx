import { LaunchInformationPage, launchPageMetadata } from '@/components/launch-information';

export function generateMetadata() {
  return launchPageMetadata('support');
}

export default function SupportPage() {
  return <LaunchInformationPage page="support" />;
}
