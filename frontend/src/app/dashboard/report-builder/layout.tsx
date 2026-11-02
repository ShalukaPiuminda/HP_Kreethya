'use client';

import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/** Report Builder is only for the developer (vendor) account. */
export default function ReportBuilderLayout({ children }: { children: React.ReactNode }) {
  const { isDeveloper } = useAuth();

  if (!isDeveloper) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-500">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        This page is not available.
      </div>
    );
  }

  return <>{children}</>;
}
