'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeftRight,
  BadgeDollarSign,
  BadgeCheck,
  Banknote,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ContactRound,
  Database,
  Factory,
  FileChartColumn,
  FileClock,
  FileWarning,
  FolderTree,
  GitBranch,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageSquareWarning,
  Package,
  PackageCheck,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  UserCog,
  UserRoundCheck,
  UsersRound,
  WalletCards,
  Wrench,
  X,
  FileCode2,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useFieldTabbing } from '@/lib/use-popup-keyboard';
import type { FeatureKey } from '@/lib/auth-types';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  module?: string;
  superAdminOnly?: boolean;
  developerOnly?: boolean;
  /** Paid feature: shown to everyone with a lock badge until the developer enables it. */
  feature?: FeatureKey;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Master Data',
    items: [
      { label: 'Customers', href: '/dashboard/customers', icon: UsersRound, module: 'customers' },
      { label: 'Items', href: '/dashboard/items', icon: Package, module: 'items' },
      { label: 'Suppliers', href: '/dashboard/suppliers', icon: Truck, module: 'suppliers' },
      { label: 'Guarantors', href: '/dashboard/guarantors', icon: UserRoundCheck, module: 'guarantors' },
      { label: 'Schemas', href: '/dashboard/schemas', icon: FileChartColumn, module: 'schemas' },
    ],
  },
  {
    label: 'Product Setup',
    items: [
      { label: 'Categories', href: '/dashboard/categories', icon: FolderTree, module: 'categories' },
      { label: 'Brands', href: '/dashboard/brands', icon: Tags, module: 'brands' },
      { label: 'Makes & Models', href: '/dashboard/makes', icon: Factory, module: 'makes' },
      { label: 'Colors', href: '/dashboard/colors', icon: Palette, module: 'colors' },
      { label: 'Stores', href: '/dashboard/stores', icon: Store, module: 'stores' },
      { label: 'Departments', href: '/dashboard/departments', icon: Building2, module: 'departments' },
    ],
  },
  {
    label: 'Operations Setup',
    items: [
      { label: 'Areas & Routes', href: '/dashboard/areas', icon: Map, module: 'areas' },
      { label: 'Banks & Branches', href: '/dashboard/banks', icon: Landmark, module: 'banks' },
      { label: 'Salespeople', href: '/dashboard/salespeople', icon: ContactRound, module: 'salesmen' },
      { label: 'Return Reasons', href: '/dashboard/sales-return-reasons', icon: MessageSquareWarning, module: 'sales-return-reasons' },
      { label: 'Companies', href: '/dashboard/companies', icon: BriefcaseBusiness, module: 'companies' },
      { label: 'ERP Branches', href: '/dashboard/branches', icon: GitBranch, module: 'branches' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Invoices', href: '/dashboard/sales', icon: ReceiptText, module: 'sales' },
      { label: 'Sales Returns', href: '/dashboard/sales-returns', icon: RotateCcw, module: 'sales' },
      { label: 'Customer Payments', href: '/dashboard/customer-payments', icon: WalletCards, module: 'sales' },
    ],
  },
  {
    label: 'Hire Purchase',
    items: [
      { label: 'HP Agreements', href: '/dashboard/hire-purchase', icon: ScrollText, module: 'hire-purchase' },
      { label: 'Installments', href: '/dashboard/installments', icon: CalendarClock, module: 'installments' },
      { label: 'HP to Cash', href: '/dashboard/hp-conversion', icon: RefreshCcw, module: 'hire-purchase' },
      { label: 'Reminder Letters', href: '/dashboard/reminder-letters', icon: FileWarning, module: 'reminder-letters' },
    ],
  },
  {
    label: 'Purchases',
    items: [
      { label: 'Purchase Orders', href: '/dashboard/purchase-orders', icon: ClipboardList, module: 'purchases' },
      { label: 'Purchase Receipts', href: '/dashboard/purchases', icon: PackageCheck, module: 'purchases' },
      { label: 'Supplier Payments', href: '/dashboard/supplier-payments', icon: HandCoins, module: 'purchases' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Stock Levels', href: '/dashboard/stock', icon: Boxes, module: 'items' },
      { label: 'Stock Transfers', href: '/dashboard/stock-transfers', icon: ArrowLeftRight, module: 'items' },
      { label: 'Reorder Alerts', href: '/dashboard/reorder-alerts', icon: FileClock, module: 'items' },
    ],
  },
  {
    label: 'Service',
    items: [
      { label: 'Service Tickets', href: '/dashboard/service', icon: Wrench, module: 'service' },
    ],
  },
  {
    label: 'Accounts',
    items: [
      { label: 'Cheque Clearing', href: '/dashboard/cheques', icon: BadgeCheck, module: 'accounts' },
      { label: 'Chart of Accounts', href: '/dashboard/chart-of-accounts', icon: Landmark, module: 'accounts' },
      { label: 'Payment Vouchers', href: '/dashboard/vouchers', icon: Banknote, module: 'accounts' },
      { label: 'Expenses', href: '/dashboard/expenses', icon: BadgeDollarSign, module: 'accounts' },
      { label: 'Banking', href: '/dashboard/banking', icon: Landmark, module: 'accounts' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users', href: '/dashboard/users', icon: UserCog, superAdminOnly: true },
      { label: 'Roles & Permissions', href: '/dashboard/roles', icon: ShieldCheck, superAdminOnly: true },
      { label: 'Backups & Refresh', href: '/dashboard/backups', icon: Database, superAdminOnly: true },
      { label: 'Reports', href: '/dashboard/reports', icon: ChartNoAxesCombined, module: 'reports' },
      { label: 'Report Builder', href: '/dashboard/report-builder', icon: FileCode2, developerOnly: true },
      { label: 'SMS Notifications', href: '/dashboard/sms', icon: MessageSquareText, module: 'sms', feature: 'sms' },
    ],
  },
  {
    label: 'Developer',
    items: [
      { label: 'Feature Control', href: '/dashboard/developer', icon: KeyRound, developerOnly: true },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useFieldTabbing();
  const {
    user,
    isAuthenticated,
    isSuperAdmin,
    isDeveloper,
    loading,
    logout,
    hasPermission,
    featureEnabled,
  } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.developerOnly) return isDeveloper;
          // Locked paid features stay visible so users know they can be bought.
          if (item.feature && !featureEnabled(item.feature)) return true;
          if (item.superAdminOnly) return isSuperAdmin;
          if (!item.module) return true;
          return hasPermission(item.module, 'can_read');
        }),
      })).filter((group) => group.items.length > 0),
    [featureEnabled, hasPermission, isDeveloper, isSuperAdmin]
  );
  const activeGroupLabel = useMemo(
    () =>
      navGroups.find((group) =>
        group.items.some((item) => isActivePath(pathname, item.href))
      )?.label || navGroups[0]?.label || 'Main',
    [navGroups, pathname]
  );
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const selectedGroup = expandedGroup ?? activeGroupLabel;

  const currentPage =
    navGroups
      .flatMap((group) => group.items)
      .find((item) => isActivePath(pathname, item.href))?.label || 'Dashboard';

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      if (pathname !== '/login') {
        sessionStorage.setItem(
          'redirect_after_login',
          pathname || '/dashboard'
        );
      }
      router.replace('/login');
    }
  }, [isAuthenticated, loading, pathname, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          Loading workspace...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const initials = (user?.username || 'HP')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-950 print:block print:h-auto print:overflow-visible print:bg-white">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white text-slate-950 shadow-2xl shadow-slate-950/10 transition-all duration-300 print:hidden lg:relative lg:inset-auto lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'w-20' : 'w-72'}`}
      >
        <div className="border-b border-slate-200 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
              <ShoppingCart className="h-5 w-5" strokeWidth={2.2} />
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold tracking-wide text-slate-950">
                  Hire Purchase
                </span>
                <span className="block truncate text-xs text-slate-500">
                  Operations workspace
                </span>
              </span>
            )}
          </Link>

          <button
            type="button"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 lg:inline-flex"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            aria-label="Close navigation"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
          </div>

          <div
            className={`mt-3 flex items-center rounded-xl border border-slate-200 bg-slate-50 ${
              collapsed ? 'justify-center p-2' : 'gap-2 p-2'
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-slate-900 shadow-sm ring-1 ring-slate-200">
              {initials}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-950">
                    {user?.username}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {user?.role?.name} / {user?.BC}
                  </span>
                </span>
                <button
                  type="button"
                  title="Sign out"
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                  onClick={logout}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {collapsed && (
            <button
              type="button"
              title="Sign out"
              className="mt-2 flex w-full items-center justify-center rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <nav
            className="sidebar-scrollbar h-full space-y-2 overflow-y-auto px-3 py-4 pr-4"
          >
            {navGroups.map((group) => (
              <div key={group.label} className="rounded-2xl">
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedGroup((current) =>
                        (current ?? activeGroupLabel) === group.label
                          ? ''
                          : group.label
                      )
                    }
                    className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.12em] transition ${
                      selectedGroup === group.label
                        ? 'bg-slate-100 text-slate-950'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {group.label}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition ${
                        selectedGroup === group.label ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                )}

                <div
                  className={`space-y-1 ${
                    collapsed || selectedGroup === group.label
                      ? 'block'
                      : 'hidden'
                  }`}
                >
                  {group.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    const Icon = item.icon;
                    const locked = !!item.feature && !featureEnabled(item.feature);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={
                          locked
                            ? `${item.label} (Premium - contact us to enable)`
                            : collapsed
                              ? item.label
                              : undefined
                        }
                        className={`group flex items-center rounded-xl text-sm font-medium transition ${
                          collapsed
                            ? 'justify-center px-2 py-2.5'
                            : 'gap-3 px-3 py-2.5'
                        } ${
                          active
                            ? 'bg-slate-950 text-white shadow-lg shadow-slate-200'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                        }`}
                      >
                        <Icon
                          className={`h-[18px] w-[18px] shrink-0 transition ${
                            active
                              ? 'text-white'
                              : 'text-slate-400 group-hover:text-slate-700'
                          }`}
                          strokeWidth={2}
                        />
                        {!collapsed && (
                          <>
                            <span className="min-w-0 flex-1 truncate">
                              {item.label}
                            </span>
                            {locked && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                <LockKeyhole className="h-3 w-3" />
                                Premium
                              </span>
                            )}
                            {active && !locked && <ChevronRight className="h-4 w-4" />}
                          </>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

        </div>
      </aside>

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur print:hidden lg:hidden">
          <button
            type="button"
            aria-label="Open navigation"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 shadow-sm"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {currentPage}
            </p>
            <p className="truncate text-xs text-slate-500">
              {user?.BC} branch
            </p>
          </div>
        </header>

        <main className="content-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto print:block print:overflow-visible">
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8 print-sheet print:max-w-none">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
