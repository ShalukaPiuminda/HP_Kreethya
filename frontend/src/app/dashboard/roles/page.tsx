'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Landmark,
  LoaderCircle,
  PencilLine,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  SquareDashedMousePointer,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api, getApiErrorMessage } from '@/lib/api';
import {
  OperationActions,
  OperationField,
  OperationHeader,
  OperationModal,
  OperationNotice,
} from '@/components/operation-ui';

interface Role {
  id: number;
  name: string;
  description: string;
  users_count?: number;
}

interface Permission {
  id: number;
  role_id: number;
  module: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
}

type Preset = 'none' | 'view' | 'editor' | 'full';

interface ModuleEntry {
  module: string;
  label: string;
  description: string;
  coverage: string[];
}

interface ModuleCategory {
  name: string;
  icon: LucideIcon;
  className: string;
  borderClassName: string;
  items: ModuleEntry[];
}

const PRESETS: {
  key: Preset;
  label: string;
  icon: LucideIcon;
  className: string;
}[] = [
  {
    key: 'none',
    label: 'No Access',
    icon: Ban,
    className: 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100',
  },
  {
    key: 'view',
    label: 'View',
    icon: Eye,
    className: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
  },
  {
    key: 'editor',
    label: 'Editor',
    icon: PencilLine,
    className: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  },
  {
    key: 'full',
    label: 'Full',
    icon: ShieldCheck,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  },
];

const PERM_MAP: Record<
  Preset,
  { can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }
> = {
  none: { can_read: false, can_create: false, can_update: false, can_delete: false },
  view: { can_read: true, can_create: false, can_update: false, can_delete: false },
  editor: { can_read: true, can_create: true, can_update: true, can_delete: false },
  full: { can_read: true, can_create: true, can_update: true, can_delete: true },
};

const MODULE_CATEGORIES: ModuleCategory[] = [
  {
    name: 'Master Data',
    icon: UsersRound,
    className: 'from-blue-50 to-transparent',
    borderClassName: 'border-blue-100',
    items: [
      {
        module: 'customers',
        label: 'Customers',
        description: 'Customer profile setup and account ownership.',
        coverage: ['Customer master', 'HP customer picks', 'Sales customer picks'],
      },
      {
        module: 'items',
        label: 'Items & Inventory',
        description: 'Item master, stock operations, and batch visibility.',
        coverage: ['Items', 'Stock levels', 'Stock transfers', 'Reorder alerts', 'Opening stock'],
      },
      {
        module: 'suppliers',
        label: 'Suppliers',
        description: 'Supplier master setup and supplier lookups.',
        coverage: ['Suppliers', 'Service supplier picks'],
      },
      {
        module: 'guarantors',
        label: 'Guarantors',
        description: 'Guarantor registry used by HP agreements.',
        coverage: ['Guarantors'],
      },
      {
        module: 'schemas',
        label: 'Schemas',
        description: 'Hire purchase plan definitions and rules.',
        coverage: ['HP schemas'],
      },
      {
        module: 'categories',
        label: 'Categories',
        description: 'Product category master.',
        coverage: ['Item categories'],
      },
      {
        module: 'brands',
        label: 'Brands',
        description: 'Product brand master.',
        coverage: ['Brands'],
      },
      {
        module: 'makes',
        label: 'Makes & Models',
        description: 'Make/model catalog for inventory.',
        coverage: ['Makes', 'Models'],
      },
      {
        module: 'colors',
        label: 'Colors',
        description: 'Color master for item variants.',
        coverage: ['Colors'],
      },
      {
        module: 'stores',
        label: 'Stores',
        description: 'Store locations used by stock, sales, and GRNs.',
        coverage: ['Stores'],
      },
    ],
  },
  {
    name: 'Operations',
    icon: SquareDashedMousePointer,
    className: 'from-emerald-50 to-transparent',
    borderClassName: 'border-emerald-100',
    items: [
      {
        module: 'areas',
        label: 'Areas & Routes',
        description: 'Delivery coverage and route planning setup.',
        coverage: ['Areas', 'Routes'],
      },
      {
        module: 'banks',
        label: 'Banks & Branches',
        description: 'Customer cheque banks plus internal bank accounts.',
        coverage: ['Bank accounts', 'Bank branches'],
      },
      {
        module: 'salesmen',
        label: 'Salespeople',
        description: 'Salesperson directory for invoices.',
        coverage: ['Salespeople'],
      },
      {
        module: 'sales-return-reasons',
        label: 'Return Reasons',
        description: 'Controlled reasons for sales returns.',
        coverage: ['Sales return reasons'],
      },
      {
        module: 'sales',
        label: 'Sales',
        description: 'Sales invoices, returns, and customer collections.',
        coverage: ['Sales invoices', 'Sales returns', 'Customer payments', 'Customer advances'],
      },
      {
        module: 'purchases',
        label: 'Purchases',
        description: 'Procurement flow from PO to supplier settlement.',
        coverage: ['Purchase orders', 'Purchase receipts / GRN', 'Supplier payments'],
      },
      {
        module: 'hire-purchase',
        label: 'Hire Purchase',
        description: 'Agreement creation, conversion, and returns.',
        coverage: ['HP agreements', 'HP to cash conversion', 'HP returns'],
      },
      {
        module: 'installments',
        label: 'Installments',
        description: 'Installment due lists and payment posting.',
        coverage: ['Installments'],
      },
      {
        module: 'reminder-letters',
        label: 'Reminder Letters',
        description: 'Arrears list, reminder letters 1-3 and seizing orders.',
        coverage: ['Arrears list & print (read)', 'Record letters as printed (create)', 'Letter formats, timing, next print dates (update)'],
      },
      {
        module: 'service',
        label: 'Service',
        description: 'Service tickets, dispatches, repairs, and service billing.',
        coverage: ['Service tickets', 'Supplier dispatches', 'Service invoicing', 'Service payments'],
      },
    ],
  },
  {
    name: 'Finance',
    icon: Landmark,
    className: 'from-amber-50 to-transparent',
    borderClassName: 'border-amber-100',
    items: [
      {
        module: 'accounts',
        label: 'Finance & Treasury',
        description: 'Ledger, vouchers, cheque clearing, expenses, and banking.',
        coverage: ['Cheque clearing', 'Chart of accounts', 'Vouchers', 'Expenses', 'Banking'],
      },
      {
        module: 'reports',
        label: 'Reports',
        description: 'Overview, trial balance, and day-end close.',
        coverage: ['Overview report', 'Trial balance', 'Day-end preview', 'Day-end closing'],
      },
      {
        module: 'sms',
        label: 'SMS Notifications (Premium)',
        description: 'View the SMS log, send custom messages and arrears reminders, resend or delete entries.',
        coverage: ['SMS log (read)', 'Send / resend / custom SMS (create)', 'Delete log entries (delete)'],
      },
    ],
  },
  {
    name: 'Administration',
    icon: Settings2,
    className: 'from-purple-50 to-transparent',
    borderClassName: 'border-purple-100',
    items: [
      {
        module: 'companies',
        label: 'Companies',
        description: 'Legal entity and branding details.',
        coverage: ['Company master'],
      },
      {
        module: 'branches',
        label: 'ERP Branches',
        description: 'Operational branches and branch metadata.',
        coverage: ['Branches'],
      },
      {
        module: 'departments',
        label: 'Departments',
        description: 'Department setup.',
        coverage: ['Departments'],
      },
      {
        module: 'roles',
        label: 'Roles',
        description: 'Role definition and permission assignment.',
        coverage: ['Role creation', 'Permission matrix'],
      },
      {
        module: 'users',
        label: 'Users',
        description: 'User creation and role assignment.',
        coverage: ['User accounts'],
      },
      {
        module: 'help-desk',
        label: 'Help Desk',
        description: 'Support requests sent to the system provider.',
        coverage: ['View request status (read)', 'Submit new requests (create)'],
      },
      {
        module: 'settings',
        label: 'Settings',
        description: 'Reserved settings access for future ERP controls.',
        coverage: ['Reserved system settings'],
      },
    ],
  },
];

const ALL_MODULES = Array.from(
  new Set(MODULE_CATEGORIES.flatMap((category) => category.items.map((item) => item.module)))
);

const DEFAULT_EXPANDED = Object.fromEntries(
  MODULE_CATEGORIES.map((category, index) => [category.name, index < 2])
) as Record<string, boolean>;

export default function RolesPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Record<number, Record<string, Permission>>>({});
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [searchMod, setSearchMod] = useState('');
  const [selectedMods, setSelectedMods] = useState<Record<string, Set<string>>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>(DEFAULT_EXPANDED);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [notice, setNotice] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const fetchRoles = useCallback(async () => {
    setNotice(null);
    try {
      const response = await api.getAll<Role>('/v1/roles');
      const roleRows = response.data ?? [];
      if (response.success) {
        setRoles(roleRows);
        setSelectedRole((current) => {
          if (current && roleRows.some((role) => role.id === current)) {
            return current;
          }
          const editableRole = roleRows.find((role) => role.name !== 'Super Admin');
          return editableRole?.id ?? roleRows[0]?.id ?? null;
        });
      }
    } catch (error: unknown) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to load roles.'),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPermissions = useCallback(async (roleId: number) => {
    try {
      const response = await api.get<Permission[]>(`/v1/permissions?role_id=${roleId}`);
      if (response.success && response.data) {
        const map: Record<string, Permission> = {};
        response.data.forEach((permission) => {
          map[permission.module] = permission;
        });
        setPermissions((current) => ({ ...current, [roleId]: map }));
      }
    } catch (error: unknown) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to load role permissions.'),
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (authLoading) return;
      if (!isSuperAdmin) {
        setLoading(false);
        router.replace('/dashboard');
        return;
      }

      void fetchRoles();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authLoading, fetchRoles, isSuperAdmin, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isSuperAdmin && selectedRole) {
        const role = roles.find((entry) => entry.id === selectedRole);
        if (role?.name !== 'Super Admin') {
          void fetchPermissions(selectedRole);
        }
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchPermissions, isSuperAdmin, roles, selectedRole]);

  const currentRole = roles.find((role) => role.id === selectedRole) || null;
  const activeRoleId = currentRole?.id ?? 0;
  const normalizedSearch = searchMod.trim().toLowerCase();
  const isSuperAdminRole = currentRole?.name === 'Super Admin';

  const getPerm = useCallback(
    (roleId: number, module: string) => permissions[roleId]?.[module],
    [permissions]
  );

  const getPreset = useCallback(
    (roleId: number, module: string): Preset => {
      const permission = getPerm(roleId, module);
      if (!permission?.can_read) return 'none';
      if (permission.can_delete && permission.can_create && permission.can_update) return 'full';
      if (permission.can_create && permission.can_update) return 'editor';
      return 'view';
    },
    [getPerm]
  );

  const setPreset = useCallback((roleId: number, module: string, preset: Preset) => {
    const values = PERM_MAP[preset];
    setPermissions((current) => {
      const rolePermissions = { ...(current[roleId] || {}) };
      rolePermissions[module] = {
        ...(rolePermissions[module] || { module, role_id: roleId }),
        ...values,
      } as Permission;
      return { ...current, [roleId]: rolePermissions };
    });
  }, []);

  const toggleModSelection = (categoryName: string, module: string) => {
    setSelectedMods((current) => {
      const nextSet = new Set(current[categoryName] || []);
      if (nextSet.has(module)) {
        nextSet.delete(module);
      } else {
        nextSet.add(module);
      }
      return { ...current, [categoryName]: nextSet };
    });
  };

  const toggleCategorySelection = (categoryName: string, modules: string[]) => {
    setSelectedMods((current) => {
      const currentSet = new Set(current[categoryName] || []);
      const allSelected = modules.every((module) => currentSet.has(module));
      return {
        ...current,
        [categoryName]: allSelected ? new Set() : new Set(modules),
      };
    });
  };

  const clearCategorySelection = (categoryName: string) => {
    setSelectedMods((current) => ({ ...current, [categoryName]: new Set() }));
  };

  const toggleExpanded = (categoryName: string) => {
    setExpanded((current) => ({ ...current, [categoryName]: !current[categoryName] }));
  };

  const setAllExpanded = (value: boolean) => {
    setExpanded(
      Object.fromEntries(MODULE_CATEGORIES.map((category) => [category.name, value])) as Record<
        string,
        boolean
      >
    );
  };

  const applyPresetToCategory = (
    roleId: number,
    categoryName: string,
    modules: string[],
    preset: Preset
  ) => {
    const selected = selectedMods[categoryName];
    const targets =
      selected && selected.size > 0 ? modules.filter((module) => selected.has(module)) : modules;

    targets.forEach((module) => setPreset(roleId, module, preset));

    if (selected && selected.size > 0) {
      clearCategorySelection(categoryName);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      const response = await api.post<Role>('/v1/roles', form);
      const createdRole = response.data;
      if (response.success && createdRole) {
        setShowCreate(false);
        setForm({ name: '', description: '' });
        await fetchRoles();
        setSelectedRole(createdRole.id);
        setPermissions((current) => ({ ...current, [createdRole.id]: {} }));
        setNotice({ type: 'success', message: `Role "${createdRole.name}" created.` });
      }
    } catch (error: unknown) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to create role.'),
      });
    }
  };

  const saveAll = async () => {
    if (!selectedRole || isSuperAdminRole) return;

    setSaving(true);
    setSaveStatus('saving');
    setNotice(null);

    try {
      const payload = ALL_MODULES.map((module) => {
        const permission = permissions[selectedRole]?.[module];
        return {
          module,
          can_read: permission?.can_read ?? false,
          can_create: permission?.can_create ?? false,
          can_update: permission?.can_update ?? false,
          can_delete: permission?.can_delete ?? false,
        };
      });

      const response = await api.put<Permission[]>(`/v1/permissions/${selectedRole}`, {
        permissions: payload,
      });

      if (response.success && response.data) {
        const map: Record<string, Permission> = {};
        response.data.forEach((permission) => {
          map[permission.module] = permission;
        });
        setPermissions((current) => ({ ...current, [selectedRole]: map }));
        setSaveStatus('saved');
        setNotice({ type: 'success', message: 'Permission matrix saved successfully.' });
        window.setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (error: unknown) {
      setSaveStatus('error');
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to save the permission matrix.'),
      });
      window.setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  };

  const filteredCategories = useMemo(
    () =>
      MODULE_CATEGORIES.map((category) => ({
        ...category,
        items: category.items.filter((item) => {
          if (!normalizedSearch) return true;
          const target = [
            item.label,
            item.description,
            item.module,
            ...item.coverage,
          ]
            .join(' ')
            .toLowerCase();
          return target.includes(normalizedSearch);
        }),
      })).filter((category) => category.items.length > 0),
    [normalizedSearch]
  );

  const accessibleCount = useMemo(() => {
    if (!currentRole || isSuperAdminRole) return ALL_MODULES.length;
    return ALL_MODULES.filter((module) => getPreset(activeRoleId, module) !== 'none').length;
  }, [activeRoleId, currentRole, getPreset, isSuperAdminRole]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
          <LoaderCircle className="h-5 w-5 animate-spin text-indigo-600" />
          Loading roles and permissions...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Access Control"
        title="Roles & Permissions"
        description="Pick a role, expand the operational groups, then apply presets module-by-module or to a selected set."
        icon={ShieldCheck}
        actions={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Role
          </button>
        }
      />

      {notice && <OperationNotice type={notice.type}>{notice.message}</OperationNotice>}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Roles
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{roles.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Active role
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950">
            {currentRole?.name || 'None'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Modules enabled
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950">
            {accessibleCount}/{ALL_MODULES.length}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Role selector
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Choose the role you want to assign permissions to.
            </p>
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
            {roles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                No roles available yet.
              </div>
            ) : (
              roles.map((role) => {
                const active = selectedRole === role.id;
                const locked = role.name === 'Super Admin';
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedRole(role.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? 'border-indigo-200 bg-indigo-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{role.name}</span>
                          {locked && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              Locked
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {role.description || 'No description provided.'}
                        </p>
                      </div>
                      {active && <Check className="mt-0.5 h-4 w-4 text-indigo-600" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {currentRole ? (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 p-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-slate-950">{currentRole.name}</span>
                    {isSuperAdminRole && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Implicit full access
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {currentRole.description || 'Use the matrix below to define what this role can access.'}
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={searchMod}
                    onChange={(event) => setSearchMod(event.target.value)}
                    placeholder="Search modules or functions..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100 sm:w-72"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAllExpanded(true)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Expand all
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllExpanded(false)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Collapse all
                    </button>
                    <button
                      type="button"
                      onClick={saveAll}
                      disabled={saving || isSuperAdminRole}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {saving ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 p-4 text-xs font-medium text-slate-500">
                <span>
                  {saveStatus === 'saving' && 'Persisting permission changes...'}
                  {saveStatus === 'saved' && 'Changes saved.'}
                  {saveStatus === 'error' && 'Save failed. Please retry.'}
                  {saveStatus === 'idle' && 'Select one module, a subset, or an entire category before applying a preset.'}
                </span>
              </div>
            </section>

            {isSuperAdminRole && (
              <OperationNotice type="success">
                Super Admin keeps implicit access to every module and cannot be edited from the matrix.
              </OperationNotice>
            )}

            {filteredCategories.map((category) => {
              const modules = Array.from(new Set(category.items.map((item) => item.module)));
              const selected = selectedMods[category.name];
              const selectedCount = selected?.size ?? 0;
              const allSelected = modules.length > 0 && modules.every((module) => selected?.has(module));
              const enabledCount = modules.filter((module) => getPreset(activeRoleId, module) !== 'none').length;
              const isOpen = expanded[category.name];

              return (
                <section
                  key={category.name}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
                >
                  <div
                    className={`border-b ${category.borderClassName} bg-gradient-to-r ${category.className} px-4 py-4`}
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(category.name)}
                        className="flex items-center gap-3 text-left"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-500" />
                        )}
                        <category.icon className="h-5 w-5 text-slate-700" />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">{category.name}</span>
                            <span className="text-xs text-slate-400">
                              {enabledCount}/{modules.length} enabled
                            </span>
                            {selectedCount > 0 && (
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                {selectedCount} selected
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Expand to assign presets to individual modules and covered functions.
                          </p>
                        </div>
                      </button>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCategorySelection(category.name, modules)}
                          disabled={isSuperAdminRole}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {allSelected ? 'Clear category' : 'Select category'}
                        </button>
                        {selectedCount > 0 && (
                          <button
                            type="button"
                            onClick={() => clearCategorySelection(category.name)}
                            disabled={isSuperAdminRole}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Clear picked
                          </button>
                        )}
                        {PRESETS.map((preset) => {
                          const Icon = preset.icon;
                          return (
                            <button
                              key={preset.key}
                              type="button"
                              onClick={() =>
                                applyPresetToCategory(
                                  activeRoleId,
                                  category.name,
                                  modules,
                                  preset.key
                                )
                              }
                              disabled={isSuperAdminRole}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${preset.className}`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {selectedCount > 0 ? `Apply ${preset.label}` : preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="divide-y divide-slate-100">
                      {category.items.map((item) => {
                        const preset = getPreset(activeRoleId, item.module);
                        const isSelected = selected?.has(item.module) ?? false;

                        return (
                          <div
                            key={`${category.name}-${item.module}`}
                            className={`px-4 py-4 transition ${
                              isSelected ? 'bg-indigo-50/60' : 'bg-white'
                            }`}
                          >
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                              <button
                                type="button"
                                onClick={() => toggleModSelection(category.name, item.module)}
                                disabled={isSuperAdminRole}
                                className="flex flex-1 items-start gap-3 text-left disabled:cursor-not-allowed"
                              >
                                <span
                                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                                    isSelected
                                      ? 'border-indigo-500 bg-indigo-500 text-white'
                                      : 'border-slate-300 bg-white text-transparent'
                                  }`}
                                >
                                  ✓
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-900">
                                      {item.label}
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                      {item.module}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {item.coverage.map((coverage) => (
                                      <span
                                        key={coverage}
                                        className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                                      >
                                        {coverage}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </button>

                              <div
                                className="flex items-center gap-2"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {PRESETS.map((presetOption) => {
                                  const Icon = presetOption.icon;
                                  return (
                                    <button
                                      key={presetOption.key}
                                      type="button"
                                      onClick={() => setPreset(activeRoleId, item.module, presetOption.key)}
                                      disabled={isSuperAdminRole}
                                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                        preset === presetOption.key
                                          ? `${presetOption.className} ring-1 ring-offset-1`
                                          : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
                                      }`}
                                    >
                                      <Icon className="h-3.5 w-3.5" />
                                      {presetOption.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveAll}
                disabled={saving || isSuperAdminRole}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save All Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400 shadow-sm">
            Select a role to manage permissions.
          </div>
        )}
      </div>

      {showCreate && (
        <OperationModal
          title="Create role"
          description="Create the role first, then assign module permissions from the matrix."
          onClose={() => setShowCreate(false)}
          width="max-w-md"
        >
          <form onSubmit={handleCreate} className="space-y-4 p-6">
            <OperationField label="Role name" required>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="e.g. Branch Manager"
                required
              />
            </OperationField>

            <OperationField label="Description">
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                rows={4}
                placeholder="What can this role do?"
              />
            </OperationField>

            <OperationActions
              saving={false}
              submitLabel="Create role"
              onCancel={() => setShowCreate(false)}
              disabled={!form.name.trim()}
            />
          </form>
        </OperationModal>
      )}
    </div>
  );
}
