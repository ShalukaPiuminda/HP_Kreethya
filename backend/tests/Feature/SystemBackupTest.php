<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use ZipArchive;

class SystemBackupTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_create_backup_zip_with_csv_groups(): void
    {
        Storage::fake('local');
        $this->seed(DatabaseSeeder::class);

        $this->artisan('erp:seed-report-demo --branch=HQ')->assertExitCode(0);

        $admin = User::query()->where('email', 'admin@erp.com')->firstOrFail();
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/system/backups', [
            'mode' => 'continue',
        ])->assertCreated();

        $filename = $response->json('data.filename');

        Storage::disk('local')->assertExists('backups/'.$filename);

        $zip = new ZipArchive();
        $zip->open(Storage::disk('local')->path('backups/'.$filename));

        $this->assertNotFalse($zip->locateName('manifest.json'));
        $this->assertNotFalse($zip->locateName('sales/t_invoice_sums.csv'));
        $this->assertNotFalse($zip->locateName('hire-purchase/t_hire_purchase_sums.csv'));
        $this->assertNotFalse($zip->locateName('finance/t_account_trans.csv'));

        $zip->close();
    }

    public function test_backup_and_refresh_clears_operational_tables_but_preserves_master_data(): void
    {
        Storage::fake('local');
        $this->seed(DatabaseSeeder::class);

        $this->artisan('erp:seed-report-demo --branch=HQ')->assertExitCode(0);

        $admin = User::query()->where('email', 'admin@erp.com')->firstOrFail();
        Sanctum::actingAs($admin);

        $this->assertDatabaseCount('t_invoice_sums', 2);
        $this->assertDatabaseCount('t_purchases_sums', 2);
        $this->assertDatabaseCount('t_hire_purchase_sums', 1);
        $this->assertDatabaseHas('items', ['item_code' => 'RPTDEMO-BAT-SER-001']);
        $this->assertDatabaseHas('customers', ['Code' => 'RPTDEMO-CUS-001']);

        $response = $this->postJson('/api/v1/system/backups', [
            'mode' => 'refresh',
        ])->assertCreated()
            ->assertJsonPath('data.refresh_summary.rows_cleared', fn ($value) => $value > 0);

        $filename = $response->json('data.filename');
        Storage::disk('local')->assertExists('backups/'.$filename);
        Storage::disk('local')->assertExists('backups/'.str_replace('.zip', '.json', $filename));
        $this->assertSame('completed', $response->json('data.status'));

        $this->assertDatabaseCount('t_invoice_sums', 0);
        $this->assertDatabaseCount('t_purchases_sums', 0);
        $this->assertDatabaseCount('t_hire_purchase_sums', 0);
        $this->assertDatabaseCount('t_account_trans', 0);
        $this->assertDatabaseHas('items', ['item_code' => 'RPTDEMO-BAT-SER-001']);
        $this->assertDatabaseHas('customers', ['Code' => 'RPTDEMO-CUS-001']);
        $this->assertSame('0.00', (string) Customer::query()->where('Code', 'RPTDEMO-CUS-001')->value('advance_balance'));
    }

    public function test_non_super_admin_cannot_access_backup_endpoints(): void
    {
        $role = Role::create([
            'name' => 'Manager',
            'description' => 'Branch manager',
        ]);

        $user = User::create([
            'username' => 'manager',
            'email' => 'manager@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'HQ',
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/system/backups')->assertForbidden();
        $this->postJson('/api/v1/system/backups', ['mode' => 'continue'])->assertForbidden();
    }
}
