<?php

namespace App\Services;

use App\Models\BranchDel;
use App\Models\Company;
use App\Models\HpStatusHistory;
use App\Models\MGuarantor;
use App\Models\MSchema;
use App\Models\ReminderLetterLog;
use App\Models\ReminderLetterSetting;
use App\Models\ReminderLetterTemplate;
use App\Models\ReminderLetterTracker;
use App\Models\THirePurchaseSum;
use App\Models\TInstalment;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Arrears reminder letters: letter 1 -> letter 2 -> letter 3 -> seizing order.
 * Stage timing and letter wording are admin-editable; each agreement's progress
 * lives in reminder_letter_trackers and resets once its arrears are cleared.
 */
class ReminderLetterService
{
    public const STAGE_SEIZURE = 4;

    public const STAGE_LABELS = [
        1 => 'Letter 1',
        2 => 'Letter 2',
        3 => 'Letter 3',
        4 => 'Seizing Order',
    ];

    /** Settings column holding the waiting days before each stage. */
    private const STAGE_DAY_SETTINGS = [
        1 => 'letter1_after_days',
        2 => 'letter2_after_days',
        3 => 'letter3_after_days',
        4 => 'seizure_after_days',
    ];

    public const DEFAULT_TEMPLATES = [
        1 => [
            'title' => 'First Reminder - Overdue Installments',
            'body' => "Dear {recipient_name},\n\nRe: Hire Purchase Agreement No. {agreement_no} ({items})\n\nOur records show that {overdue_installments} installment(s) on the above agreement are overdue since {oldest_due_date}. The total amount in arrears is Rs. {arrears_amount}.\n\nWe kindly request you to settle the arrears on or before {settle_by_date}. If you have already made this payment, please ignore this letter.\n\nThank you,\n\n\n.................................\nManager\n{company_name}",
        ],
        2 => [
            'title' => 'Second Reminder - Arrears Still Outstanding',
            'body' => "Dear {recipient_name},\n\nRe: Hire Purchase Agreement No. {agreement_no} ({items})\n\nFurther to our letter dated {previous_letter_date}, we note that the arrears on the above agreement have not been settled. You now have {overdue_installments} overdue installment(s) totalling Rs. {arrears_amount}, with late charges of Rs. {penalty_amount}.\n\nPlease settle the full arrears on or before {settle_by_date} to avoid further action.\n\nThank you,\n\n\n.................................\nManager\n{company_name}",
        ],
        3 => [
            'title' => 'Final Notice Before Repossession',
            'body' => "Dear {recipient_name},\n\nRe: FINAL NOTICE - Hire Purchase Agreement No. {agreement_no} ({items})\n\nDespite our letters, the arrears of Rs. {arrears_amount} ({overdue_installments} installments, overdue since {oldest_due_date}) remain unpaid.\n\nThis is our final notice. If the full arrears are not settled on or before {settle_by_date}, we will take steps to repossess the goods under the terms of the agreement without further notice.\n\nThank you,\n\n\n.................................\nManager\n{company_name}",
        ],
        4 => [
            'title' => 'Seizing Order',
            'body' => "SEIZING ORDER\n\nAgreement No: {agreement_no}\nHirer: {customer_name} ({customer_nic})\nAddress: {customer_address}\nGoods: {items}\nGuarantors: {guarantor_names}\n\nThe hirer has failed to settle arrears of Rs. {arrears_amount} ({overdue_installments} installments, overdue since {oldest_due_date}) despite reminder letters. Total outstanding on the agreement is Rs. {outstanding_amount}.\n\nThe bearer of this order is authorised to repossess the above goods on behalf of {company_name}.\n\n\n.................................\nAuthorised Officer\n{company_name}",
        ],
    ];

    public const PLACEHOLDERS = [
        '{date}', '{recipient_name}', '{recipient_address}',
        '{customer_name}', '{customer_nic}', '{customer_phone}', '{customer_address}',
        '{agreement_no}', '{invoice_no}', '{agreement_date}', '{items}', '{instalment_amount}',
        '{overdue_installments}', '{oldest_due_date}', '{days_overdue}', '{arrears_amount}',
        '{penalty_amount}', '{outstanding_amount}', '{settle_by_date}', '{previous_letter_date}',
        '{guarantor_names}', '{company_name}', '{company_address}', '{company_phone}',
        '{branch_name}', '{branch_phone}',
    ];

    public function __construct(private readonly HPService $hpService)
    {
    }

    public function settings(): ReminderLetterSetting
    {
        return ReminderLetterSetting::query()->orderBy('id')->first()
            ?? ReminderLetterSetting::create(['updated_by' => 'system']);
    }

    public function saveSettings(array $values, User $user): ReminderLetterSetting
    {
        $settings = $this->settings();
        $settings->fill($values + ['updated_by' => $user->username])->save();

        return $settings;
    }

    public function templates(): Collection
    {
        foreach (self::DEFAULT_TEMPLATES as $stage => $template) {
            ReminderLetterTemplate::firstOrCreate(['stage' => $stage], $template + ['updated_by' => 'system']);
        }

        return ReminderLetterTemplate::query()->orderBy('stage')->get();
    }

    public function saveTemplate(int $stage, string $title, string $body, User $user): ReminderLetterTemplate
    {
        return ReminderLetterTemplate::updateOrCreate(
            ['stage' => $stage],
            ['title' => $title, 'body' => $body, 'updated_by' => $user->username]
        );
    }

    /**
     * Every agreement in this branch with overdue installments, with its letter stage.
     *
     * @return array{rows: array<int, array>, summary: array<string, int>}
     */
    public function arrearsList(string $branchCode, array $filters = []): array
    {
        $rows = $this->buildRows($branchCode);

        $summary = [
            'total' => count($rows),
            'due_1' => 0,
            'due_2' => 0,
            'due_3' => 0,
            'seizure_ready' => 0,
            'seizure_issued' => 0,
            'waiting' => 0,
            'arrears_amount' => round(array_sum(array_column($rows, 'arrears_amount')), 2),
        ];
        foreach ($rows as $row) {
            match ($row['status']) {
                'due' => $summary['due_'.$row['next_stage']]++,
                default => $summary[$row['status']]++,
            };
        }

        $status = $filters['status'] ?? null;
        $stage = isset($filters['stage']) && $filters['stage'] !== '' ? (int) $filters['stage'] : null;
        $search = mb_strtolower(trim((string) ($filters['search'] ?? '')));

        $rows = array_values(array_filter($rows, function (array $row) use ($status, $stage, $search) {
            if ($status && $row['status'] !== $status) {
                return false;
            }
            if ($stage !== null && $row['next_stage'] !== $stage) {
                return false;
            }
            if ($search !== '') {
                $haystack = mb_strtolower(implode(' ', [
                    $row['invoice_no'], $row['agreement_no'], $row['customer_code'],
                    $row['customer_name'], $row['customer_phone'], $row['customer_nic'],
                ]));

                return str_contains($haystack, $search);
            }

            return true;
        }));

        return ['rows' => $rows, 'summary' => $summary];
    }

    /**
     * Rendered letters (customer + one per guarantor) for the given agreements.
     */
    public function renderLetters(string $branchCode, array $invoiceNos, int $stage): array
    {
        $rows = collect($this->buildRows($branchCode))->keyBy('invoice_no');
        $template = $this->templates()->firstWhere('stage', $stage);
        ['company' => $company, 'branch' => $branch] = $this->letterhead($branchCode);
        $settleBy = Carbon::today()->addDays($this->settings()->settle_within_days);

        $letters = [];
        $skipped = [];
        foreach (array_unique($invoiceNos) as $invoiceNo) {
            $row = $rows->get($invoiceNo);
            if (! $row) {
                $skipped[] = $invoiceNo;
                continue;
            }

            $guarantors = $this->guarantors($row, $branchCode);
            foreach ($this->recipients($row, $guarantors) as $recipient) {
                $vars = $this->letterVariables($row, $recipient, $guarantors, $company, $branch, $settleBy);
                $letters[] = [
                    'invoice_no' => $row['invoice_no'],
                    'agreement_no' => $row['agreement_no'],
                    'stage' => $stage,
                    'stage_label' => self::STAGE_LABELS[$stage],
                    'recipient_type' => $recipient['type'],
                    'recipient_code' => $recipient['code'],
                    'recipient_name' => $recipient['name'],
                    'recipient_address' => $recipient['address'],
                    'title' => $this->render($template->title, $vars),
                    'body' => $this->render($template->body, $vars),
                    'date' => $vars['date'],
                ];
            }
        }

        return [
            'letters' => $letters,
            'skipped' => $skipped,
            'company' => $company,
            'branch' => $branch,
        ];
    }

    /**
     * Record that a stage's letters were printed. Printing the next stage advances
     * the tracker; reprinting an earlier stage only adds to the log.
     */
    public function markPrinted(string $branchCode, array $invoiceNos, int $stage, User $user): array
    {
        $rows = collect($this->buildRows($branchCode))->keyBy('invoice_no');
        $today = Carbon::today();
        $advanced = 0;
        $logged = 0;
        $skipped = [];

        DB::transaction(function () use ($invoiceNos, $rows, $stage, $branchCode, $user, $today, &$advanced, &$logged, &$skipped) {
            foreach (array_unique($invoiceNos) as $invoiceNo) {
                $row = $rows->get($invoiceNo);
                if (! $row || $stage > $row['last_stage'] + 1) {
                    $skipped[] = $invoiceNo;
                    continue;
                }

                foreach ($this->recipients($row, $this->guarantors($row, $branchCode)) as $recipient) {
                    ReminderLetterLog::create([
                        'invoice_no' => $invoiceNo,
                        'BC' => $branchCode,
                        'stage' => $stage,
                        'recipient_type' => $recipient['type'],
                        'recipient_code' => $recipient['code'],
                        'recipient_name' => $recipient['name'],
                        'arrears_amount' => $row['arrears_amount'],
                        'printed_by' => $user->username,
                        'printed_at' => now(),
                    ]);
                    $logged++;
                }

                if ($stage === $row['last_stage'] + 1) {
                    ReminderLetterTracker::updateOrCreate(
                        ['invoice_no' => $invoiceNo],
                        [
                            'BC' => $branchCode,
                            'last_stage' => $stage,
                            'last_printed_at' => $today->toDateString(),
                            'next_print_date_override' => null,
                            'override_note' => null,
                            'updated_by' => $user->username,
                        ]
                    );
                    HpStatusHistory::create([
                        'invoice_no' => $invoiceNo,
                        'event' => $stage === self::STAGE_SEIZURE ? 'seizing_order' : 'reminder_letter',
                        'from_status' => $row['agreement_status'],
                        'to_status' => $row['agreement_status'],
                        'description' => self::STAGE_LABELS[$stage].' printed. Arrears Rs. '.number_format($row['arrears_amount'], 2),
                        'event_date' => $today->toDateString(),
                        'BC' => $branchCode,
                        'UID' => $user->username,
                    ]);
                    $advanced++;
                }
            }
        });

        return ['advanced' => $advanced, 'logged' => $logged, 'skipped' => $skipped];
    }

    public function setNextDate(string $branchCode, string $invoiceNo, ?string $date, ?string $note, User $user): ReminderLetterTracker
    {
        $this->assertAgreementInBranch($branchCode, $invoiceNo);

        $tracker = ReminderLetterTracker::firstOrNew(['invoice_no' => $invoiceNo]);
        $tracker->fill([
            'BC' => $branchCode,
            'last_stage' => $tracker->last_stage ?? 0,
            'next_print_date_override' => $date,
            'override_note' => $date ? $note : null,
            'updated_by' => $user->username,
        ])->save();

        return $tracker;
    }

    public function history(string $branchCode, string $invoiceNo): array
    {
        $this->assertAgreementInBranch($branchCode, $invoiceNo);

        return [
            'tracker' => ReminderLetterTracker::query()->where('invoice_no', $invoiceNo)->first(),
            'logs' => ReminderLetterLog::query()
                ->where('BC', $branchCode)
                ->where('invoice_no', $invoiceNo)
                ->orderByDesc('printed_at')
                ->orderByDesc('id')
                ->get(),
        ];
    }

    /**
     * Company and branch printed on the letter header: the branch's own company, else the first company.
     *
     * @return array{company: ?Company, branch: ?BranchDel}
     */
    public function letterhead(string $branchCode): array
    {
        $branch = BranchDel::query()->where('bccode', $branchCode)->with('company')->first();

        return [
            'company' => $branch?->company ?? Company::query()->orderBy('id')->first(),
            'branch' => $branch?->withoutRelations(),
        ];
    }

    public function render(string $template, array $vars): string
    {
        $replace = [];
        foreach ($vars as $key => $value) {
            $replace['{'.$key.'}'] = (string) $value;
        }

        return strtr($template, $replace);
    }

    private function buildRows(string $branchCode): array
    {
        $today = Carbon::today();

        $overdue = TInstalment::query()
            ->where('BC', $branchCode)
            ->whereIn('status', ['pending', 'partial'])
            ->whereDate('instalment_date', '<', $today->toDateString())
            ->where('balance_amount', '>', 0)
            ->orderBy('instalment_date')
            ->get(['invoice_no', 'instalment_date', 'balance_amount'])
            ->groupBy('invoice_no');

        $agreements = THirePurchaseSum::query()
            ->where('BC', $branchCode)
            ->where('status', 'active')
            ->whereIn('invoice_no', $overdue->keys())
            ->with('details:invoice_no,item_description,qty')
            ->get()
            ->keyBy('invoice_no');

        $trackers = ReminderLetterTracker::query()
            ->where('BC', $branchCode)
            ->get()
            ->keyBy('invoice_no');

        $this->resetSettledTrackers($trackers, $agreements->keys());

        $schemas = MSchema::query()->where('BC', $branchCode)->get()->keyBy('SchemaType');
        $settings = $this->settings();

        $rows = [];
        foreach ($agreements as $invoiceNo => $agreement) {
            $instalments = $overdue->get($invoiceNo);
            $schema = $schemas->get($agreement->schema_type);
            $penalty = 0.0;
            foreach ($instalments as $instalment) {
                $penalty += $this->hpService->calculatePenalty(
                    (float) $instalment->balance_amount,
                    $instalment->instalment_date->toDateString(),
                    (float) ($schema->PanaltyCharage ?? 0),
                    (int) ($schema->GracePeriodDays ?? 5)
                )['penalty_amount'];
            }

            $oldestDue = $instalments->first()->instalment_date->copy()->startOfDay();
            $tracker = $trackers->get($invoiceNo);
            $lastStage = (int) ($tracker->last_stage ?? 0);
            $lastPrinted = $tracker?->last_printed_at;
            $nextStage = $lastStage < self::STAGE_SEIZURE ? $lastStage + 1 : null;

            $autoDate = null;
            if ($nextStage) {
                $base = $lastStage === 0 ? $oldestDue->copy() : $lastPrinted->copy();
                $autoDate = $base->addDays((int) $settings->{self::STAGE_DAY_SETTINGS[$nextStage]});
            }
            $override = $nextStage ? $tracker?->next_print_date_override : null;
            $nextDate = $override ?? $autoDate;

            $status = match (true) {
                $nextStage === null => 'seizure_issued',
                $nextDate->lte($today) && $nextStage === self::STAGE_SEIZURE => 'seizure_ready',
                $nextDate->lte($today) => 'due',
                default => 'waiting',
            };

            $rows[] = [
                'id' => $agreement->id,
                'invoice_no' => $invoiceNo,
                'agreement_no' => $agreement->agreement_no ?: $invoiceNo,
                'agreement_date' => $agreement->invoice_date?->toDateString(),
                'agreement_status' => $agreement->status,
                'customer_code' => $agreement->customer_code,
                'customer_name' => $agreement->customer_name,
                'customer_nic' => $agreement->customer_nic,
                'customer_phone' => $agreement->customer_phone,
                'customer_address' => $agreement->customer_address,
                'guarantor_1_code' => $agreement->guarantor_1_code,
                'guarantor_2_code' => $agreement->guarantor_2_code,
                'items' => $agreement->details->pluck('item_description')->filter()->implode(', '),
                'instalment_amount' => (float) $agreement->instalment,
                'outstanding_amount' => (float) $agreement->outstanding_amount,
                'overdue_installments' => $instalments->count(),
                'arrears_amount' => round((float) $instalments->sum('balance_amount'), 2),
                'penalty_amount' => round($penalty, 2),
                'oldest_due_date' => $oldestDue->toDateString(),
                'days_overdue' => (int) $oldestDue->diffInDays($today),
                'last_stage' => $lastStage,
                'last_stage_label' => self::STAGE_LABELS[$lastStage] ?? null,
                'last_printed_at' => $lastPrinted?->toDateString(),
                'next_stage' => $nextStage,
                'next_stage_label' => $nextStage ? self::STAGE_LABELS[$nextStage] : null,
                'auto_next_date' => $autoDate?->toDateString(),
                'next_print_date' => $nextDate?->toDateString(),
                'is_overridden' => $override !== null,
                'override_note' => $override ? $tracker->override_note : null,
                'status' => $status,
            ];
        }

        usort($rows, fn (array $a, array $b) => [$a['next_print_date'] ?? '9999', $b['days_overdue']]
            <=> [$b['next_print_date'] ?? '9999', $a['days_overdue']]);

        return $rows;
    }

    /**
     * Agreements no longer in arrears start again from letter 1 next time.
     */
    private function resetSettledTrackers(Collection $trackers, Collection $inArrears): void
    {
        $settled = $trackers->keys()->diff($inArrears)->filter(function (string $invoiceNo) use ($trackers) {
            $tracker = $trackers->get($invoiceNo);

            return $tracker->last_stage > 0 || $tracker->next_print_date_override !== null;
        });

        if ($settled->isEmpty()) {
            return;
        }

        ReminderLetterTracker::query()
            ->whereIn('invoice_no', $settled->values())
            ->update([
                'last_stage' => 0,
                'last_printed_at' => null,
                'next_print_date_override' => null,
                'override_note' => null,
                'updated_at' => now(),
            ]);

        foreach ($settled as $invoiceNo) {
            $trackers->forget($invoiceNo);
        }
    }

    private function recipients(array $row, Collection $guarantors): array
    {
        $recipients = [[
            'type' => 'customer',
            'code' => $row['customer_code'],
            'name' => $row['customer_name'],
            'address' => $row['customer_address'],
        ]];

        foreach ($guarantors as $guarantor) {
            $recipients[] = [
                'type' => 'guarantor',
                'code' => $guarantor->Code,
                'name' => $guarantor->name,
                'address' => $guarantor->address,
            ];
        }

        return $recipients;
    }

    private function guarantors(array $row, string $branchCode): Collection
    {
        $codes = array_values(array_filter([$row['guarantor_1_code'], $row['guarantor_2_code']]));
        if ($codes === []) {
            return collect();
        }

        $guarantors = MGuarantor::query()
            ->where('BC', $branchCode)
            ->whereIn('Code', $codes)
            ->get()
            ->keyBy('Code');

        return collect($codes)->map(fn (string $code) => $guarantors->get($code))->filter()->values();
    }

    private function letterVariables(array $row, array $recipient, Collection $guarantors, ?Company $company, ?BranchDel $branch, Carbon $settleBy): array
    {
        $date = fn (?string $value) => $value ? Carbon::parse($value)->format('d M Y') : '-';
        $money = fn (float $value) => number_format($value, 2);

        return [
            'date' => Carbon::today()->format('d M Y'),
            'recipient_name' => $recipient['name'],
            'recipient_address' => $recipient['address'] ?? '',
            'customer_name' => $row['customer_name'],
            'customer_nic' => $row['customer_nic'] ?? '',
            'customer_phone' => $row['customer_phone'] ?? '',
            'customer_address' => $row['customer_address'] ?? '',
            'agreement_no' => $row['agreement_no'],
            'invoice_no' => $row['invoice_no'],
            'agreement_date' => $date($row['agreement_date']),
            'items' => $row['items'] ?: '-',
            'instalment_amount' => $money($row['instalment_amount']),
            'overdue_installments' => $row['overdue_installments'],
            'oldest_due_date' => $date($row['oldest_due_date']),
            'days_overdue' => $row['days_overdue'],
            'arrears_amount' => $money($row['arrears_amount']),
            'penalty_amount' => $money($row['penalty_amount']),
            'outstanding_amount' => $money($row['outstanding_amount']),
            'settle_by_date' => $settleBy->format('d M Y'),
            'previous_letter_date' => $date($row['last_printed_at']),
            'guarantor_names' => $guarantors->pluck('name')->implode(', ') ?: '-',
            'company_name' => $company->name ?? '',
            'company_address' => $company->address ?? '',
            'company_phone' => $company->phone ?? '',
            'branch_name' => $branch->name ?? '',
            'branch_phone' => $branch->phone ?? '',
        ];
    }

    private function assertAgreementInBranch(string $branchCode, string $invoiceNo): void
    {
        $exists = THirePurchaseSum::query()
            ->where('BC', $branchCode)
            ->where('invoice_no', $invoiceNo)
            ->exists();

        if (! $exists) {
            throw ValidationException::withMessages(['invoice_no' => 'Agreement not found in this branch.']);
        }
    }
}
