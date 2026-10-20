<?php

namespace Database\Seeders;

use App\Models\BranchDel;
use App\Models\Company;
use App\Models\MChartofAccount;
use App\Models\MMainAccountType;
use App\Models\MMainCategory;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\Store;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        BranchDel::updateOrCreate(
            ['bccode' => 'HQ'],
            [
                'name' => 'Head Office',
                'phone' => '0112000000',
                'address' => 'Main Street, Colombo',
            ]
        );

        Company::updateOrCreate(
            ['email' => 'info@company.com'],
            [
                'name' => 'Default Company',
                'address' => 'Colombo, Sri Lanka',
                'phone' => '0112000000',
            ]
        );

        Store::updateOrCreate(
            ['name' => 'Main Store', 'BC' => 'HQ'],
            ['location' => 'Head Office', 'UID' => 'system']
        );

        Store::updateOrCreate(
            ['name' => 'Warehouse', 'BC' => 'HQ'],
            ['location' => 'Head Office Warehouse', 'UID' => 'system']
        );

        $adminRole = Role::updateOrCreate(
            ['name' => Role::SUPER_ADMIN],
            ['description' => 'Full system access. Permissions are implicit.']
        );

        $managerRole = Role::updateOrCreate(
            ['name' => 'Manager'],
            ['description' => 'Can manage daily operations.']
        );

        $cashierRole = Role::updateOrCreate(
            ['name' => 'Cashier'],
            ['description' => 'Can process sales and payments.']
        );

        $modules = [
            'companies',
            'branches',
            'departments',
            'stores',
            'categories',
            'brands',
            'makes',
            'colors',
            'items',
            'customers',
            'suppliers',
            'schemas',
            'guarantors',
            'banks',
            'areas',
            'routes',
            'salesmen',
            'sales',
            'purchases',
            'hire-purchase',
            'installments',
            'service',
            'accounts',
            'reports',
            'settings',
            'sales-return-reasons',
            'sms',
            'reminder-letters',
        ];

        foreach ($modules as $module) {
            RolePermission::updateOrCreate(
                ['role_id' => $managerRole->id, 'module' => $module],
                [
                    'can_create' => true,
                    'can_read' => true,
                    'can_update' => true,
                    'can_delete' => false,
                    'BC' => 'HQ',
                    'UID' => 'system',
                ]
            );
        }

        foreach (['customers', 'items', 'sales', 'installments'] as $module) {
            RolePermission::updateOrCreate(
                ['role_id' => $cashierRole->id, 'module' => $module],
                [
                    'can_create' => true,
                    'can_read' => true,
                    'can_update' => false,
                    'can_delete' => false,
                    'BC' => 'HQ',
                    'UID' => 'system',
                ]
            );
        }

        $this->upsertUser('admin', 'admin@erp.com', $adminRole->id);
        $this->upsertUser('manager', 'manager@erp.com', $managerRole->id);
        $this->upsertUser('cashier', 'cashier@erp.com', $cashierRole->id);

        $assetCategory = MMainCategory::firstOrCreate(['name' => 'Assets']);
        $liabilityCategory = MMainCategory::firstOrCreate(['name' => 'Liabilities']);
        MMainCategory::firstOrCreate(['name' => 'Equity']);
        MMainCategory::firstOrCreate(['name' => 'Income']);
        MMainCategory::firstOrCreate(['name' => 'Expenses']);

        $cashType = MMainAccountType::firstOrCreate([
            'category_id' => $assetCategory->id,
            'name' => 'Cash & Bank',
        ]);
        $receivableType = MMainAccountType::firstOrCreate([
            'category_id' => $assetCategory->id,
            'name' => 'Accounts Receivable',
        ]);
        $inventoryType = MMainAccountType::firstOrCreate([
            'category_id' => $assetCategory->id,
            'name' => 'Inventory',
        ]);
        $payableType = MMainAccountType::firstOrCreate([
            'category_id' => $liabilityCategory->id,
            'name' => 'Accounts Payable',
        ]);
        $hpReceivableType = MMainAccountType::firstOrCreate([
            'category_id' => $assetCategory->id,
            'name' => 'HP Receivables',
        ]);

        $accounts = [
            ['1001', 'Cash in Hand', $cashType->id],
            ['1002', 'Bank Account', $cashType->id],
            ['1101', 'Accounts Receivable', $receivableType->id],
            ['1102', 'Cheques In Hand', $receivableType->id],
            ['1201', 'Inventory - Stock', $inventoryType->id],
            ['1301', 'HP Receivables', $hpReceivableType->id],
            ['2001', 'Accounts Payable', $payableType->id],
            ['2002', 'Cheques Payable', $payableType->id],
        ];

        foreach ($accounts as [$code, $description, $typeId]) {
            MChartofAccount::updateOrCreate(
                ['code' => $code],
                [
                    'description' => $description,
                    'type_id' => $typeId,
                    'BC' => 'HQ',
                    'UID' => 'system',
                ]
            );
        }
    }

    private function upsertUser(string $username, string $email, int $roleId): void
    {
        $user = User::firstOrNew(['email' => $email]);
        $user->username = $username;
        $user->role_id = $roleId;
        $user->BC = 'HQ';
        $user->password = Hash::make((string) env('ERP_DEMO_PASSWORD', 'password'));

        $user->save();
    }
}
