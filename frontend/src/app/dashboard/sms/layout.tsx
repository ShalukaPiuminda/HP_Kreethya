import { FeatureGate } from '@/components/feature-gate';

export default function SmsLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="sms">{children}</FeatureGate>;
}
