<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use App\Services\Sms\InstallmentReminderService;
use Database\Seeders\DeveloperUserSeeder;
use App\Models\CustomReport;
use App\Services\ReportDemoDataService;
use App\Services\Reports\CustomReportFileStore;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('erp:seed-report-demo {--branch=HQ} {--user=} {--fresh}', function (ReportDemoDataService $service) {
    if ($this->option('fresh')) {
        $this->line('Clearing existing demo data first...');
        $service->clear((string) $this->option('branch'));
    }

    $summary = $service->seed(
        (string) $this->option('branch'),
        $this->option('user') ? (string) $this->option('user') : null
    );

    $this->info('Report demo data seeded successfully.');
    $this->table(
        ['Metric', 'Value'],
        collect($summary['verification'] ?? [])
            ->map(fn ($value, $key) => [$key, (string) $value])
            ->values()
            ->all()
    );
})->purpose('Seed reversible sample data for reports, stock movement, sales, purchases, HP, and cash flow.');

Artisan::command('erp:clear-report-demo {--branch=HQ}', function (ReportDemoDataService $service) {
    $summary = $service->clear((string) $this->option('branch'));

    $this->info('Report demo data cleared successfully.');
    $this->table(
        ['Resource', 'Deleted'],
        collect($summary['deleted'] ?? [])
            ->map(fn ($value, $key) => [$key, (string) $value])
            ->values()
            ->all()
    );
})->purpose('Remove report demo data created by erp:seed-report-demo in one shot.');

Artisan::command('reports:export', function (CustomReportFileStore $files) {
    $reports = CustomReport::query()->orderBy('name')->get();
    foreach ($reports as $report) {
        $this->line('  ' . $files->write($report));
    }
    $this->info("Wrote {$reports->count()} report file(s) to " . $files->directory());
})->purpose('Save every Report Builder report as a file in resources/reports (to deploy them with the code).');

Artisan::command('reports:sync', function (CustomReportFileStore $files) {
    $result = $files->sync();
    $this->info("Report files synced: {$result['created']} created, {$result['updated']} updated, {$result['removed']} removed, {$result['exported']} written to files.");
    foreach ($result['skipped'] as $slug => $reason) {
        $this->warn("  Skipped {$slug}.json: {$reason}");
    }
})->purpose('Load resources/reports/*.json into the database now (this also happens automatically when reports are opened).');

Artisan::command('erp:developer-user', function () {
    $this->call('db:seed', ['--class' => DeveloperUserSeeder::class, '--force' => true]);
    $this->info('Developer account is ready (username: developer, password from DEVELOPER_PASSWORD).');
})->purpose('Create or reset the hidden developer account that enables paid features.');

Artisan::command('sms:installment-reminders', function (InstallmentReminderService $reminders) {
    $result = $reminders->runDaily();
    foreach (['arrears' => 'Arrears SMS', 'reminders' => 'Due-date reminders'] as $key => $label) {
        $counts = collect($result[$key] ?? [])->map(fn ($count, $status) => "{$status}: {$count}")->implode(', ');
        $this->line("{$label}: ".($counts ?: 'nothing to send'));
    }
})->purpose('Send arrears and upcoming-installment SMS reminders (SMS feature must be enabled).');

// Needs the OS scheduler to run `php artisan schedule:run` every minute (cron / Windows Task Scheduler).
Schedule::command('sms:installment-reminders')->dailyAt(config('services.notifylk.reminder_time', '09:00'))->withoutOverlapping();
