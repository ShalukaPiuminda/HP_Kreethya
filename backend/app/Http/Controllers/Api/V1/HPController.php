<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\THirePurchaseSum;
use App\Models\TInstalment;
use App\Services\HPService;
use App\Services\Sms\SmsService;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class HPController extends BaseController
{
    public function __construct(
        private readonly HPService $hpService,
        private readonly SmsService $sms
    ) {
    }

    public function calculate(Request $request)
    {
        $validated = $request->validate([
            'schema_type' => ['required', 'string'],
            'net_amount' => ['required', 'numeric', 'min:0.01'],
            'down_payment' => ['required', 'numeric', 'min:0'],
            'transport' => ['nullable', 'numeric', 'min:0'],
        ]);

        return $this->successResponse(
            $this->hpService->calculate($validated, $request->user()->BC),
            'Hire purchase calculation completed.'
        );
    }

    public function options(Request $request)
    {
        return $this->successResponse($this->hpService->options($request->user()));
    }

    public function index(Request $request)
    {
        $agreements = THirePurchaseSum::query()
            ->where('BC', $request->user()->BC)
            ->with(['customer', 'store', 'conversions'])
            ->when($request->query('search'), function ($query, string $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('invoice_no', 'like', "%{$search}%")
                        ->orWhere('agreement_no', 'like', "%{$search}%")
                        ->orWhere('customer_name', 'like', "%{$search}%")
                        ->orWhere('customer_nic', 'like', "%{$search}%");
                });
            })
            ->when($request->query('status'), fn ($query, string $status) => $query->where('status', $status))
            ->when($request->query('date_from'), fn ($query, string $date) => $query->whereDate('invoice_date', '>=', $date))
            ->when($request->query('date_to'), fn ($query, string $date) => $query->whereDate('invoice_date', '<=', $date))
            ->orderByDesc('invoice_date')
            ->orderByDesc('id')
            ->paginate(min(max((int) $request->integer('per_page', 25), 1), 100));

        return $this->paginatedResponse($agreements, 'Hire purchase agreements retrieved.');
    }

    public function show(Request $request, int $id)
    {
        return $this->successResponse($this->hpService->loadAgreement($id, $request->user()->BC));
    }

    public function store(Request $request)
    {
        $agreement = $this->hpService->createAgreement(
            $this->validateAgreement($request),
            $request->user()
        );
        $sms = $this->sms->notifyHpPayment($agreement, (float) $agreement->paid_amount, $request->user());

        return $this->successResponse($agreement, 'Hire purchase agreement created.'.SmsService::statusLabel($sms), 201);
    }

    public function storeOpening(Request $request)
    {
        $agreement = $this->hpService->createOpeningAgreement(
            $this->validateOpeningAgreement($request),
            $request->user()
        );

        return $this->successResponse($agreement, 'Opening hire purchase agreement created.', 201);
    }

    public function getInstallment(Request $request, int $id)
    {
        $instalment = TInstalment::query()
            ->whereKey($id)
            ->where('BC', $request->user()->BC)
            ->with(['sum.schema', 'payments.bankAccount'])
            ->firstOrFail();
        $penalty = $this->hpService->calculatePenalty(
            (float) $instalment->balance_amount,
            $instalment->instalment_date->format('Y-m-d'),
            (float) $instalment->sum->schema->PanaltyCharage,
            (int) $instalment->sum->schema->GracePeriodDays,
            $request->query('as_of')
        );

        return $this->successResponse(compact('instalment', 'penalty'));
    }

    public function payInstallment(Request $request, int $id)
    {
        $validated = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0'],
            'payment_method' => ['required', Rule::in(['cash', 'card', 'cheque', 'bank_transfer'])],
            'bank_detail_id' => ['nullable', 'integer'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'waive_penalty' => ['nullable', 'boolean'],
            'note' => ['nullable', 'string', 'max:1000'],
            'cheque' => ['nullable', 'array'],
            'cheque.bank_id' => ['nullable', 'integer'],
            'cheque.bank_branch_id' => ['nullable', 'integer'],
            'cheque.cheque_no' => ['nullable', 'string', 'max:50'],
            'cheque.account_no' => ['nullable', 'string', 'max:50'],
            'cheque.due_date' => ['nullable', 'date'],
        ]);

        $agreement = $this->hpService->payInstallment($id, $validated, $request->user());
        // Sent right after the payment transaction commits; failures are only logged.
        $sms = $this->sms->notifyHpPayment($agreement, (float) $validated['amount'], $request->user());

        return $this->successResponse(
            $agreement,
            'Installment payment recorded.'.SmsService::statusLabel($sms)
        );
    }

    public function installments(Request $request)
    {
        $filters = $this->validateInstallmentFilters(
            $request,
            ['instalment_date', 'balance_amount', 'agreement_no', 'customer_name', 'instalment_no']
        );

        $today = today();
        $unpaid = self::UNPAID_STATUSES;
        $query = $this->filteredInstallmentQuery($request, $filters, $today);

        $overdueQuery = (clone $query)->whereIn('status', $unpaid)->whereDate('instalment_date', '<', $today);
        $summary = [
            'count' => (clone $query)->count(),
            'balance_total' => round((float) (clone $query)->sum('balance_amount'), 2),
            'overdue_count' => (clone $overdueQuery)->count(),
            'overdue_amount' => round((float) (clone $overdueQuery)->sum('balance_amount'), 2),
            'overdue_agreements' => (clone $overdueQuery)->distinct()->count('invoice_no'),
        ];

        $sort = $filters['sort'] ?? 'instalment_date';
        $direction = $filters['direction'] ?? 'asc';
        $installments = $query
            ->with([
                'sum:id,invoice_no,agreement_no,customer_name,customer_nic,customer_phone,schema_type,status',
                'sum.schema:id,SchemaType,PanaltyCharage,GracePeriodDays',
            ])
            ->orderBy($sort, $direction)
            ->orderBy('id')
            ->paginate((int) ($filters['per_page'] ?? 50));

        $installments->getCollection()->each(function (TInstalment $instalment) use ($today, $unpaid) {
            $isOverdue = in_array($instalment->status, $unpaid, true) && $instalment->instalment_date->lt($today);
            $schema = $instalment->sum?->schema;
            $instalment->setAttribute('days_overdue', $isOverdue ? (int) $instalment->instalment_date->diffInDays($today) : 0);
            $instalment->setAttribute('estimated_penalty', $isOverdue && $schema
                ? $this->hpService->calculatePenalty(
                    (float) $instalment->balance_amount,
                    $instalment->instalment_date->format('Y-m-d'),
                    (float) $schema->PanaltyCharage,
                    (int) $schema->GracePeriodDays,
                    $today->format('Y-m-d')
                )['penalty_amount']
                : 0.0);
        });

        return response()->json([
            'success' => true,
            'message' => 'Installments retrieved.',
            'data' => $installments->items(),
            'meta' => [
                'current_page' => $installments->currentPage(),
                'last_page' => $installments->lastPage(),
                'per_page' => $installments->perPage(),
                'total' => $installments->total(),
            ],
            'summary' => $summary,
        ]);
    }

    /**
     * Collections worklist grouped by agreement: one row per agreement with its
     * schedule totals. The installment filters decide which agreements appear;
     * the totals always cover the agreement's full schedule.
     */
    public function installmentAgreements(Request $request)
    {
        $filters = $this->validateInstallmentFilters(
            $request,
            ['instalment_date', 'balance_amount', 'agreement_no', 'customer_name', 'instalment_no', 'arrears_amount']
        );

        $today = today();
        $todayString = $today->toDateString();
        $branch = $request->user()->BC;
        $unpaidSql = "status IN ('pending', 'partial')";

        // Aging is judged on the agreement's oldest unpaid installment, so it is applied below instead.
        $matching = $this->filteredInstallmentQuery($request, Arr::except($filters, ['aging']), $today)
            ->select('invoice_no');

        $stats = DB::table('t_instalments')
            ->where('BC', $branch)
            ->groupBy('invoice_no')
            ->selectRaw("invoice_no,
                COUNT(*) AS instalment_count,
                SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
                SUM(CASE WHEN {$unpaidSql} THEN balance_amount ELSE 0 END) AS outstanding_total,
                SUM(CASE WHEN {$unpaidSql} AND instalment_date < ? THEN balance_amount ELSE 0 END) AS arrears_amount,
                SUM(CASE WHEN {$unpaidSql} AND instalment_date < ? THEN 1 ELSE 0 END) AS arrears_count,
                MIN(CASE WHEN {$unpaidSql} THEN instalment_date END) AS next_due_date", [$todayString, $todayString]);

        $base = THirePurchaseSum::query()
            ->from('t_hire_purchase_sums as hp')
            ->joinSub($stats, 'st', 'st.invoice_no', '=', 'hp.invoice_no')
            ->where('hp.BC', $branch)
            ->whereIn('hp.invoice_no', $matching)
            ->when($filters['aging'] ?? null, function ($query, string $aging) use ($today) {
                [$minDays, $maxDays] = $this->agingRange($aging);
                $query->where('st.arrears_count', '>', 0)
                    ->where('st.next_due_date', '<=', $today->copy()->subDays($minDays)->toDateString())
                    ->when($maxDays, fn ($inner) => $inner->where('st.next_due_date', '>=', $today->copy()->subDays($maxDays)->toDateString()));
            });

        $summary = [
            'count' => (clone $base)->count(),
            'outstanding_total' => round((float) (clone $base)->sum('st.outstanding_total'), 2),
            'arrears_amount' => round((float) (clone $base)->sum('st.arrears_amount'), 2),
            'arrears_agreements' => (clone $base)->where('st.arrears_count', '>', 0)->count(),
        ];

        $direction = $filters['direction'] ?? 'asc';
        match ($filters['sort'] ?? 'instalment_date') {
            'agreement_no' => $base->orderBy('hp.agreement_no', $direction),
            'customer_name' => $base->orderBy('hp.customer_name', $direction),
            'balance_amount' => $base->orderBy('st.outstanding_total', $direction),
            'arrears_amount' => $base->orderBy('st.arrears_amount', $direction),
            'instalment_no' => $base->orderBy('st.paid_count', $direction),
            // Agreements with nothing left to pay go last regardless of direction.
            default => $base->orderByRaw('st.next_due_date IS NULL')->orderBy('st.next_due_date', $direction),
        };

        $agreements = $base
            ->select([
                'hp.id', 'hp.invoice_no', 'hp.agreement_no', 'hp.customer_name', 'hp.customer_nic',
                'hp.customer_phone', 'hp.schema_type', 'hp.status',
                'st.instalment_count', 'st.paid_count', 'st.outstanding_total',
                'st.arrears_amount', 'st.arrears_count', 'st.next_due_date',
            ])
            ->with('schema:id,SchemaType,PanaltyCharage,GracePeriodDays')
            ->orderBy('hp.id')
            ->paginate((int) ($filters['per_page'] ?? 50));

        $unpaidByAgreement = TInstalment::query()
            ->where('BC', $branch)
            ->whereIn('invoice_no', $agreements->getCollection()->pluck('invoice_no'))
            ->whereIn('status', self::UNPAID_STATUSES)
            ->orderBy('instalment_no')
            ->get(['id', 'invoice_no', 'instalment_no', 'instalment_date', 'balance_amount', 'status'])
            ->groupBy('invoice_no');

        $rows = $agreements->getCollection()->map(function (THirePurchaseSum $agreement) use ($unpaidByAgreement, $today) {
            $unpaid = $unpaidByAgreement->get($agreement->invoice_no, collect());
            $next = $unpaid->sortBy(fn (TInstalment $row) => $row->instalment_date->format('Y-m-d').sprintf('%05d', $row->instalment_no))->first();
            $penalty = $unpaid->sum(fn (TInstalment $row) => $this->estimatePenalty($row, $agreement->schema, $today));
            $arrears = round((float) $agreement->arrears_amount, 2);

            return [
                'id' => $agreement->id,
                'invoice_no' => $agreement->invoice_no,
                'agreement_no' => $agreement->agreement_no,
                'customer_name' => $agreement->customer_name,
                'customer_nic' => $agreement->customer_nic,
                'customer_phone' => $agreement->customer_phone,
                'schema_type' => $agreement->schema_type,
                'status' => $agreement->status,
                'instalment_count' => (int) $agreement->instalment_count,
                'paid_count' => (int) $agreement->paid_count,
                'outstanding_total' => round((float) $agreement->outstanding_total, 2),
                'arrears_amount' => $arrears,
                'arrears_count' => (int) $agreement->arrears_count,
                'next_instalment_id' => $next?->id,
                'next_instalment_no' => $next?->instalment_no,
                'next_due_date' => $next?->instalment_date->format('Y-m-d'),
                'next_due_amount' => $next ? round((float) $next->balance_amount, 2) : 0.0,
                'days_overdue' => $next && $next->instalment_date->lt($today) ? (int) $next->instalment_date->diffInDays($today) : 0,
                'estimated_penalty' => round($penalty, 2),
                'payable_now' => round($arrears + $penalty, 2),
            ];
        });

        return response()->json([
            'success' => true,
            'message' => 'Agreements retrieved.',
            'data' => $rows->values(),
            'meta' => [
                'current_page' => $agreements->currentPage(),
                'last_page' => $agreements->lastPage(),
                'per_page' => $agreements->perPage(),
                'total' => $agreements->total(),
            ],
            'summary' => $summary,
        ]);
    }

    /** Full month-wise statement for one agreement, with live penalty estimates and totals. */
    public function installmentStatement(Request $request, int $id)
    {
        $today = today();
        $agreement = THirePurchaseSum::query()
            ->whereKey($id)
            ->where('BC', $request->user()->BC)
            ->with([
                'schema:id,SchemaType,PanaltyCharage,GracePeriodDays,NoOfInstallment',
                'details',
                'instalments' => fn ($query) => $query->orderBy('instalment_no'),
                'instalments.payments.bankAccount',
            ])
            ->firstOrFail();

        $unpaid = self::UNPAID_STATUSES;
        $agreement->instalments->each(function (TInstalment $row) use ($agreement, $today, $unpaid) {
            $isOverdue = in_array($row->status, $unpaid, true) && $row->instalment_date->lt($today);
            $row->setAttribute('days_overdue', $isOverdue ? (int) $row->instalment_date->diffInDays($today) : 0);
            $row->setAttribute('estimated_penalty', $this->estimatePenalty($row, $agreement->schema, $today));
        });

        $schedule = $agreement->instalments;
        $open = $schedule->whereIn('status', $unpaid);
        $overdue = $open->filter(fn (TInstalment $row) => $row->instalment_date->lt($today));
        $next = $open->sortBy(fn (TInstalment $row) => $row->instalment_date->format('Y-m-d').sprintf('%05d', $row->instalment_no))->first();
        $arrears = round((float) $overdue->sum('balance_amount'), 2);
        $penalty = round((float) $schedule->sum('estimated_penalty'), 2);

        $totals = [
            'instalment_count' => $schedule->count(),
            'paid_count' => $schedule->where('status', 'paid')->count(),
            'schedule_amount' => round((float) $schedule->sum('base_amount'), 2),
            'paid_principal' => round((float) $schedule->sum('amount_pay'), 2),
            'discount' => round((float) $schedule->sum('discount'), 2),
            'penalty_paid' => round((float) $schedule->sum('penalty_amount'), 2),
            'outstanding' => round((float) $open->sum('balance_amount'), 2),
            'arrears_amount' => $arrears,
            'arrears_count' => $overdue->count(),
            'estimated_penalty' => $penalty,
            'payable_now' => round($arrears + $penalty, 2),
            'next_instalment_id' => $next?->id,
            'next_due_date' => $next?->instalment_date->format('Y-m-d'),
            'next_due_amount' => $next ? round((float) $next->balance_amount, 2) : 0.0,
        ];

        return $this->successResponse(compact('agreement', 'totals'));
    }

    private const UNPAID_STATUSES = ['pending', 'partial'];

    private function validateInstallmentFilters(Request $request, array $sortColumns): array
    {
        return $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'invoice_no' => ['nullable', 'string', 'max:50'],
            'status' => ['nullable', Rule::in(['unpaid', 'pending', 'partial', 'paid', 'converted', 'cancelled'])],
            'view' => ['nullable', Rule::in(['today', 'week', 'month', 'overdue', 'upcoming'])],
            'aging' => ['nullable', Rule::in(['1-30', '31-60', '61-90', '90+'])],
            'due_from' => ['nullable', 'date'],
            'due_to' => ['nullable', 'date'],
            'schema_type' => ['nullable', 'string', 'max:50'],
            'agreement_status' => ['nullable', Rule::in(['active', 'completed', 'converted', 'returned'])],
            'min_balance' => ['nullable', 'numeric', 'min:0'],
            'overdue' => ['nullable', 'boolean'],
            'sort' => ['nullable', Rule::in($sortColumns)],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
    }

    /** @return array{0: int, 1: int|null} days-overdue window for an aging bucket */
    private function agingRange(string $aging): array
    {
        return match ($aging) {
            '1-30' => [1, 30],
            '31-60' => [31, 60],
            '61-90' => [61, 90],
            '90+' => [91, null],
        };
    }

    private function estimatePenalty(TInstalment $row, $schema, $today): float
    {
        if (! $schema || ! in_array($row->status, self::UNPAID_STATUSES, true) || ! $row->instalment_date->lt($today)) {
            return 0.0;
        }

        return (float) $this->hpService->calculatePenalty(
            (float) $row->balance_amount,
            $row->instalment_date->format('Y-m-d'),
            (float) $schema->PanaltyCharage,
            (int) $schema->GracePeriodDays,
            $today->format('Y-m-d')
        )['penalty_amount'];
    }

    private function filteredInstallmentQuery(Request $request, array $filters, $today)
    {
        $unpaid = self::UNPAID_STATUSES;

        return TInstalment::query()
            ->where('BC', $request->user()->BC)
            ->when($filters['search'] ?? null, function ($query, string $search) {
                $like = '%'.trim($search).'%';
                $query->where(fn ($inner) => $inner
                    ->where('agreement_no', 'like', $like)
                    ->orWhere('invoice_no', 'like', $like)
                    ->orWhere('customer_name', 'like', $like)
                    ->orWhereHas('sum', fn ($sum) => $sum
                        ->where('customer_nic', 'like', $like)
                        ->orWhere('customer_phone', 'like', $like)
                        ->orWhere('customer_name', 'like', $like)
                        ->orWhere('reference_no', 'like', $like)));
            })
            ->when($filters['invoice_no'] ?? null, fn ($query, string $invoiceNo) => $query->where('invoice_no', $invoiceNo))
            ->when($filters['status'] ?? null, fn ($query, string $status) => $status === 'unpaid'
                ? $query->whereIn('status', $unpaid)
                : $query->where('status', $status))
            ->when($filters['view'] ?? null, function ($query, string $view) use ($today, $unpaid) {
                match ($view) {
                    'today' => $query->whereDate('instalment_date', $today),
                    'week' => $query->whereBetween('instalment_date', [$today->copy()->startOfWeek()->toDateString(), $today->copy()->endOfWeek()->toDateString()]),
                    'month' => $query->whereBetween('instalment_date', [$today->copy()->startOfMonth()->toDateString(), $today->copy()->endOfMonth()->toDateString()]),
                    'overdue' => $query->whereIn('status', $unpaid)->whereDate('instalment_date', '<', $today),
                    'upcoming' => $query->whereDate('instalment_date', '>', $today),
                };
            })
            ->when($filters['aging'] ?? null, function ($query, string $aging) use ($today, $unpaid) {
                // Days overdue = today - due date, so each bucket is a due-date window.
                [$minDays, $maxDays] = $this->agingRange($aging);
                $query->whereIn('status', $unpaid)
                    ->whereDate('instalment_date', '<=', $today->copy()->subDays($minDays))
                    ->when($maxDays, fn ($inner) => $inner->whereDate('instalment_date', '>=', $today->copy()->subDays($maxDays)));
            })
            ->when($filters['due_from'] ?? null, fn ($query, string $date) => $query->whereDate('instalment_date', '>=', $date))
            ->when($filters['due_to'] ?? null, fn ($query, string $date) => $query->whereDate('instalment_date', '<=', $date))
            ->when($filters['schema_type'] ?? null, fn ($query, string $schema) => $query->whereHas('sum', fn ($sum) => $sum->where('schema_type', $schema)))
            ->when($filters['agreement_status'] ?? null, fn ($query, string $status) => $query->whereHas('sum', fn ($sum) => $sum->where('status', $status)))
            ->when(isset($filters['min_balance']), fn ($query) => $query->where('balance_amount', '>=', (float) $filters['min_balance']))
            ->when($request->boolean('overdue'), fn ($query) => $query
                ->whereIn('status', $unpaid)
                ->whereDate('instalment_date', '<', $today));
    }

    public function convert(Request $request, int $id)
    {
        $validated = $request->validate([
            'conversion_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['required', Rule::in(['cash', 'card', 'cheque', 'bank_transfer'])],
            'bank_detail_id' => ['nullable', 'integer'],
            'note' => ['nullable', 'string', 'max:1000'],
            'cheque' => ['nullable', 'array'],
            'cheque.bank_id' => ['nullable', 'integer'],
            'cheque.bank_branch_id' => ['nullable', 'integer'],
            'cheque.cheque_no' => ['nullable', 'string', 'max:50'],
            'cheque.account_no' => ['nullable', 'string', 'max:50'],
            'cheque.due_date' => ['nullable', 'date'],
        ]);

        $agreement = $this->hpService->convertToCash($id, $validated, $request->user());
        $sms = $this->sms->notifyHpPayment($agreement, (float) $validated['amount'], $request->user());

        return $this->successResponse(
            $agreement,
            'Agreement paid at once.'.SmsService::statusLabel($sms)
        );
    }

    public function returnAgreement(Request $request, int $id)
    {
        $branchCode = $request->user()->BC;
        $validated = $request->validate([
            'return_date' => ['required', 'date'],
            'store_id' => ['required', 'integer', Rule::exists('stores', 'id')->where('BC', $branchCode)],
            'reason' => ['required', 'string', 'max:1000'],
            'refund_amount' => ['nullable', 'numeric', 'min:0'],
            'refund_method' => ['nullable', Rule::in(['cash', 'card', 'cheque', 'bank_transfer'])],
            'bank_detail_id' => ['nullable', 'integer'],
        ]);

        return $this->successResponse(
            $this->hpService->returnAgreement($id, $validated, $request->user()),
            'Hire purchase return posted.'
        );
    }

    public function summary(Request $request)
    {
        return $this->successResponse(
            $this->hpService->getDashboardSummary($request->user()->BC)
        );
    }

    private function validateAgreement(Request $request): array
    {
        $branchCode = $request->user()->BC;

        return $request->validate([
            'invoice_date' => ['required', 'date'],
            'reference_no' => ['nullable', 'string', 'max:50'],
            'customer_code' => ['required', 'string', Rule::exists('customers', 'Code')->where('BC', $branchCode)],
            'guarantor_1_code' => ['required', 'string', Rule::exists('m_guarantors', 'Code')->where('BC', $branchCode)],
            'guarantor_2_code' => ['nullable', 'string', 'different:guarantor_1_code', Rule::exists('m_guarantors', 'Code')->where('BC', $branchCode)],
            'schema_type' => ['required', 'string', Rule::exists('m_schemas', 'SchemaType')->where('BC', $branchCode)],
            'store_id' => ['required', 'integer', Rule::exists('stores', 'id')->where('BC', $branchCode)],
            'down_payment' => ['required', 'numeric', 'min:0'],
            'advance_amount' => ['nullable', 'numeric', 'min:0'],
            'down_payment_method' => ['required', Rule::in(['cash', 'card', 'cheque', 'bank_transfer'])],
            'bank_detail_id' => ['nullable', 'integer'],
            'transport' => ['nullable', 'numeric', 'min:0'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'discount_type' => ['nullable', Rule::in(['amount', 'percent'])],
            'instalment_due_date' => ['required', 'integer', 'between:1,28'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_code' => ['required', 'string', Rule::exists('items', 'item_code')->where('BC', $branchCode)],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.discount' => ['nullable', 'numeric', 'min:0'],
            'items.*.discount_type' => ['nullable', Rule::in(['amount', 'percent'])],
            'items.*.batch_no' => ['nullable', 'string', 'max:50'],
            'items.*.serial_numbers' => ['nullable', 'array'],
            'items.*.serial_numbers.*' => ['required', 'string', 'max:100', 'distinct'],
            'cheque' => ['nullable', 'array'],
            'cheque.bank_id' => ['nullable', 'integer'],
            'cheque.bank_branch_id' => ['nullable', 'integer'],
            'cheque.cheque_no' => ['nullable', 'string', 'max:50'],
            'cheque.account_no' => ['nullable', 'string', 'max:50'],
            'cheque.due_date' => ['nullable', 'date'],
        ]);
    }

    private function validateOpeningAgreement(Request $request): array
    {
        $branchCode = $request->user()->BC;

        return $request->validate([
            'invoice_date' => ['required', 'date'],
            'reference_no' => ['nullable', 'string', 'max:50'],
            'opening_reference_no' => ['nullable', 'string', 'max:100'],
            'opening_note' => ['nullable', 'string', 'max:1000'],
            'customer_code' => ['required', 'string', Rule::exists('customers', 'Code')->where('BC', $branchCode)],
            'guarantor_1_code' => ['nullable', 'string', Rule::exists('m_guarantors', 'Code')->where('BC', $branchCode)],
            'guarantor_2_code' => ['nullable', 'string', 'different:guarantor_1_code', Rule::exists('m_guarantors', 'Code')->where('BC', $branchCode)],
            'schema_type' => ['required', 'string', Rule::exists('m_schemas', 'SchemaType')->where('BC', $branchCode)],
            'store_id' => ['required', 'integer', Rule::exists('stores', 'id')->where('BC', $branchCode)],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_code' => ['required', 'string', Rule::exists('items', 'item_code')->where('BC', $branchCode)],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0.01'],
            'items.*.net_value' => ['nullable', 'numeric', 'min:0.01'],
            'items.*.batch_no' => ['nullable', 'string', 'max:50'],
            'items.*.serial_numbers' => ['nullable', 'array'],
            'items.*.serial_numbers.*' => ['required', 'string', 'max:100', 'distinct'],
            'installments' => ['required', 'array', 'min:1'],
            'installments.*.instalment_no' => ['required', 'integer', 'min:1', 'distinct'],
            'installments.*.instalment_date' => ['required', 'date'],
            'installments.*.base_amount' => ['required', 'numeric', 'min:0.01'],
            'installments.*.amount_pay' => ['nullable', 'numeric', 'min:0'],
            'installments.*.balance_amount' => ['nullable', 'numeric', 'min:0'],
        ]);
    }
}
