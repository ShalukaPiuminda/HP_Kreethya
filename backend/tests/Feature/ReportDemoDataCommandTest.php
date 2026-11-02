<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ReportingService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportDemoDataCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_report_seed_and_clear_commands_are_reversible(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->artisan('erp:seed-report-demo --branch=HQ')
            ->assertExitCode(0);

        $user = User::query()
            ->where('BC', 'HQ')
            ->where('email', 'admin@erp.com')
            ->firstOrFail();

        $reporting = app(ReportingService::class);
        $today = now()->format('Y-m-d');

        $overview = $reporting->overview($user, $today, $today);
        $stock = $reporting->stockInHand($user, []);
        $purchases = $reporting->purchases($user, ['mode' => 'detail', 'from' => $today, 'to' => $today]);
        $sales = $reporting->sales($user, ['mode' => 'detail', 'from' => $today, 'to' => $today]);
        $hirePurchase = $reporting->hirePurchase($user, ['mode' => 'detail', 'from' => $today, 'to' => $today]);

        $this->assertIsNumeric($overview['sales']);
        $this->assertIsNumeric($overview['purchases']);
        $this->assertNotEmpty($stock['rows']);
        $this->assertNotEmpty($purchases['rows']);
        $this->assertNotEmpty($sales['rows']);
        $this->assertNotEmpty($hirePurchase['rows']);

        $this->assertDatabaseHas('customers', ['Code' => 'RPTDEMO-CUS-001']);
        $this->assertDatabaseHas('suppliers', ['Code' => 'RPTDEMO-SUP-001']);
        $this->assertDatabaseHas('items', ['item_code' => 'RPTDEMO-BAT-SER-001']);

        $this->artisan('erp:clear-report-demo --branch=HQ')
            ->assertExitCode(0);

        $this->assertDatabaseMissing('customers', ['Code' => 'RPTDEMO-CUS-001']);
        $this->assertDatabaseMissing('suppliers', ['Code' => 'RPTDEMO-SUP-001']);
        $this->assertDatabaseMissing('items', ['item_code' => 'RPTDEMO-BAT-SER-001']);
        $this->assertDatabaseCount('t_hire_purchase_sums', 0);
        $this->assertDatabaseCount('t_invoice_sums', 0);
        $this->assertDatabaseCount('t_purchases_sums', 0);
    }
}
