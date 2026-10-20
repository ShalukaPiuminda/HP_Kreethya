<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\DayEndBalance;
use App\Models\Item;
use App\Models\MChartofAccount;
use App\Models\Supplier;
use App\Models\Store;
use App\Models\TAccountTran;
use App\Models\TItemMovement;
use App\Models\TItemSerialMovement;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReportingService
{
    public function __construct(private readonly StockService $stockService)
    {
    }

    public function options(User $user): array
    {
        return [
            'stores' => Store::query()
                ->where('BC', $user->BC)
                ->orderBy('name')
                ->get(['id', 'name', 'location']),
            'items' => Item::query()
                ->where('BC', $user->BC)
                ->orderBy('item_code')
                ->get(['id', 'item_code', 'item_description', 'is_batch', 'is_serialized']),
            'customers' => Customer::query()
                ->where('BC', $user->BC)
                ->orderBy('name')
                ->get(['id', 'Code', 'name', 'NIC']),
            'suppliers' => Supplier::query()
                ->where('BC', $user->BC)
                ->orderBy('name')
                ->get(['id', 'Code', 'name', 'type']),
            'cash_accounts' => MChartofAccount::query()
                ->where('BC', $user->BC)
                ->whereIn('code', [AccountingService::CASH, AccountingService::BANK])
                ->orderBy('code')
                ->get(['id', 'code', 'description']),
        ];
    }

    public function overview(User $user, string $from, string $to): array
    {
        $sales = (float) DB::table('t_invoice_sums')
            ->where('BC', $user->BC)
            ->whereBetween('Invoice_date', [$from, $to])
            ->sum('Net_Amount');
        $purchases = (float) DB::table('t_purchases_sums')
            ->where('BC', $user->BC)
            ->whereBetween('Invoice_date', [$from, $to])
            ->sum('Net_Amount');
        $expenses = (float) DB::table('t_expenses')
            ->where('BC', $user->BC)
            ->where('status', 'posted')
            ->whereBetween('Expense_date', [$from, $to])
            ->sum('Expense_Amount');
        $customerCollections = (float) DB::table('t_customer_payments')
            ->where('BC', $user->BC)
            ->whereBetween('Payment_date', [$from, $to])
            ->sum('Payment_Amount');
        $hpCollections = (float) DB::table('t_hp_installment_payments')
            ->where('BC', $user->BC)
            ->whereBetween('payment_date', [$from, $to])
            ->sum('total_amount');
        $serviceCollections = (float) DB::table('t_service_customer_payments')
            ->where('BC', $user->BC)
            ->whereBetween('payment_date', [$from, $to])
            ->sum('amount');
        $supplierPayments = (float) DB::table('t_supplier_payments')
            ->where('BC', $user->BC)
            ->whereBetween('Payment_date', [$from, $to])
            ->sum('Payment_Amount');

        $dailySales = DB::table('t_invoice_sums')
            ->selectRaw('Invoice_date as report_date, SUM(Net_Amount) as total')
            ->where('BC', $user->BC)
            ->whereBetween('Invoice_date', [$from, $to])
            ->groupBy('Invoice_date')
            ->orderBy('Invoice_date')
            ->get()
            ->map(fn ($row) => ['date' => $row->report_date, 'total' => round((float) $row->total, 2)]);
        $dailyCollections = collect()
            ->merge($this->dailyTotals('t_customer_payments', 'Payment_date', 'Payment_Amount', $user->BC, $from, $to))
            ->merge($this->dailyTotals('t_hp_installment_payments', 'payment_date', 'total_amount', $user->BC, $from, $to))
            ->merge($this->dailyTotals('t_service_customer_payments', 'payment_date', 'amount', $user->BC, $from, $to))
            ->groupBy('date')
            ->map(fn ($rows, $date) => ['date' => $date, 'total' => round((float) $rows->sum('total'), 2)])
            ->sortBy('date')
            ->values();

        $trialBalance = $this->trialBalance($user, $to);
        $assetTotal = collect($trialBalance['accounts'])
            ->where('category', 'Assets')
            ->sum('display_balance');
        $liabilityTotal = collect($trialBalance['accounts'])
            ->where('category', 'Liabilities')
            ->sum('display_balance');

        return [
            'period' => compact('from', 'to'),
            'sales' => round($sales, 2),
            'purchases' => round($purchases, 2),
            'expenses' => round($expenses, 2),
            'customer_collections' => round($customerCollections + $hpCollections + $serviceCollections, 2),
            'supplier_payments' => round($supplierPayments, 2),
            'net_cash_flow' => round(
                $customerCollections + $hpCollections + $serviceCollections - $supplierPayments - $expenses,
                2
            ),
            'active_hp_outstanding' => round((float) DB::table('t_hire_purchase_sums')
                ->where('BC', $user->BC)->where('status', 'active')->sum('outstanding_amount'), 2),
            'customer_receivables' => round((float) DB::table('t_invoice_sums')
                ->where('BC', $user->BC)->sum('Credite'), 2),
            'supplier_payables' => round((float) DB::table('t_purchases_sums')
                ->where('BC', $user->BC)
                ->get(['Net_Amount', 'paid_amount'])
                ->sum(fn ($invoice) => max(0, (float) $invoice->Net_Amount - (float) $invoice->paid_amount)), 2),
            'assets' => round((float) $assetTotal, 2),
            'liabilities' => round((float) $liabilityTotal, 2),
            'daily_sales' => $dailySales,
            'daily_collections' => $dailyCollections,
            'trial_balance_difference' => $trialBalance['difference'],
        ];
    }

    public function trialBalance(User $user, string $to): array
    {
        $accounts = MChartofAccount::query()
            ->where('BC', $user->BC)
            ->with('type.category')
            ->orderBy('code')
            ->get();
        $totals = TAccountTran::query()
            ->where('BC', $user->BC)
            ->whereDate('Ddate', '<=', $to)
            ->selectRaw('AccCode, SUM(dr_amount) as debit, SUM(cr_amount) as credit')
            ->groupBy('AccCode')
            ->get()
            ->keyBy('AccCode');

        $rows = $accounts->map(function (MChartofAccount $account) use ($totals) {
            $total = $totals->get($account->code);
            $debit = round((float) ($total->debit ?? 0), 2);
            $credit = round((float) ($total->credit ?? 0), 2);
            $rawBalance = round((float) $account->opening_balance + $debit - $credit, 2);
            $category = $account->type?->category?->name ?? 'Unclassified';
            $creditNature = in_array($category, ['Liabilities', 'Equity', 'Income'], true);

            return [
                'code' => $account->code,
                'description' => $account->description,
                'type' => $account->type?->name,
                'category' => $category,
                'debit' => $debit,
                'credit' => $credit,
                'debit_balance' => $rawBalance > 0 ? $rawBalance : 0,
                'credit_balance' => $rawBalance < 0 ? abs($rawBalance) : 0,
                'display_balance' => $creditNature ? -$rawBalance : $rawBalance,
            ];
        })->values();

        $debitTotal = round((float) $rows->sum('debit'), 2);
        $creditTotal = round((float) $rows->sum('credit'), 2);

        return [
            'as_of' => $to,
            'accounts' => $rows,
            'debit_total' => $debitTotal,
            'credit_total' => $creditTotal,
            'difference' => round($debitTotal - $creditTotal, 2),
        ];
    }

    public function stockInHand(User $user, array $filters): array
    {
        $search = trim((string) ($filters['search'] ?? ''));
        $itemCode = $filters['item_code'] ?? null;
        $storeId = isset($filters['store_id']) && $filters['store_id'] !== ''
            ? (int) $filters['store_id']
            : null;

        $snapshot = collect($this->stockService->getInventorySnapshot(
            $user->BC,
            $search !== '' ? $search : (is_string($itemCode) ? $itemCode : null)
        ));

        if ($itemCode) {
            $snapshot = $snapshot->where('item_code', $itemCode)->values();
        }

        if ($storeId) {
            $snapshot = $snapshot->map(function (array $row) use ($storeId) {
                $stores = collect($row['stores'])->where('store_id', $storeId)->values();
                $batches = collect($row['batches'])->where('store_id', $storeId)->values();
                $totalQty = $row['is_batch']
                    ? (int) $batches->sum('qty_in_hand')
                    : (int) $stores->sum('qty_in_hand');
                $stockValue = $row['is_batch']
                    ? round((float) $batches->sum('stock_value'), 2)
                    : round($totalQty * (float) $row['standard_purchase_price'], 2);

                $row['stores'] = $stores->all();
                $row['batches'] = $batches->all();
                $row['total_qty'] = $totalQty;
                $row['stock_value'] = $stockValue;
                $row['is_below_reorder'] = $row['reorder_level'] > 0 && $totalQty <= $row['reorder_level'];

                return $row;
            })->values();
        }

        $serialRows = TItemSerialMovement::query()
            ->selectRaw('item_code, store_id, item_serial_no, SUM(qun_in) - SUM(qun_out) as qty_in_hand')
            ->where('bc', $user->BC)
            ->when($itemCode, fn ($query, $code) => $query->where('item_code', $code))
            ->when($storeId, fn ($query, $id) => $query->where('store_id', $id))
            ->groupBy('item_code', 'store_id', 'item_serial_no')
            ->havingRaw('SUM(qun_in) - SUM(qun_out) > 0')
            ->get();

        $rows = $snapshot
            ->map(function (array $row) use ($serialRows, $storeId) {
                $serialNumbers = $serialRows
                    ->filter(function ($serial) use ($row, $storeId) {
                        return $serial->item_code === $row['item_code']
                            && (!$storeId || (int) $serial->store_id === $storeId);
                    })
                    ->pluck('item_serial_no')
                    ->values()
                    ->all();

                return [
                    ...$row,
                    'average_cost' => $row['total_qty'] > 0
                        ? round((float) $row['stock_value'] / (int) $row['total_qty'], 2)
                        : 0,
                    'serial_numbers' => $serialNumbers,
                    'serial_count' => count($serialNumbers),
                ];
            })
            ->filter(fn (array $row) => $row['total_qty'] > 0 || $row['serial_count'] > 0)
            ->values();

        return [
            'filters' => [
                'search' => $search,
                'item_code' => $itemCode,
                'store_id' => $storeId,
            ],
            'summary' => [
                'items' => $rows->count(),
                'units' => (int) $rows->sum('total_qty'),
                'stock_value' => round((float) $rows->sum('stock_value'), 2),
                'serialized_items' => $rows->where('is_serialized', true)->count(),
            ],
            'rows' => $rows->all(),
        ];
    }

    public function binCard(User $user, array $filters): array
    {
        $itemCode = (string) $filters['item_code'];
        $storeId = isset($filters['store_id']) && $filters['store_id'] !== ''
            ? (int) $filters['store_id']
            : null;
        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;

        $item = Item::query()
            ->where('BC', $user->BC)
            ->where('item_code', $itemCode)
            ->firstOrFail();

        $base = TItemMovement::query()
            ->where('BC', $user->BC)
            ->where('item_code', $itemCode)
            ->when($storeId, fn ($query, $id) => $query->where('store_id', $id));

        $openingBalance = $from
            ? round((float) (clone $base)->whereDate('dDate', '<', $from)->sum(DB::raw('qun_in - qun_out')), 2)
            : 0;

        $movements = (clone $base)
            ->when($from, fn ($query, $date) => $query->whereDate('dDate', '>=', $date))
            ->when($to, fn ($query, $date) => $query->whereDate('dDate', '<=', $date))
            ->with('store')
            ->orderBy('dDate')
            ->orderBy('id')
            ->get();

        $serialIndex = TItemSerialMovement::query()
            ->where('bc', $user->BC)
            ->where('item_code', $itemCode)
            ->when($storeId, fn ($query, $id) => $query->where('store_id', $id))
            ->when($movements->isNotEmpty(), fn ($query) => $query->whereIn('trans_no', $movements->pluck('trans_no')->unique()))
            ->get()
            ->groupBy(fn ($row) => "{$row->trans_no}|{$row->trans_code}|{$row->store_id}");

        $runningBalance = $openingBalance;
        $rows = $movements->map(function (TItemMovement $movement) use (&$runningBalance, $serialIndex) {
            $runningBalance += (int) $movement->qun_in - (int) $movement->qun_out;
            $serials = $serialIndex
                ->get("{$movement->trans_no}|{$movement->trans_code}|{$movement->store_id}", collect())
                ->pluck('item_serial_no')
                ->values()
                ->all();

            return [
                'date' => optional($movement->dDate)->format('Y-m-d'),
                'trans_no' => $movement->trans_no,
                'trans_code' => $movement->trans_code,
                'movement_type' => $this->movementLabel($movement->trans_code),
                'store_name' => $movement->store?->name ?? "Store {$movement->store_id}",
                'batch_no' => $movement->batch_no,
                'qty_in' => (int) $movement->qun_in,
                'qty_out' => (int) $movement->qun_out,
                'running_balance' => $runningBalance,
                'serial_numbers' => $serials,
                'serial_count' => count($serials),
            ];
        })->values();

        return [
            'item' => [
                'item_code' => $item->item_code,
                'item_description' => $item->item_description,
                'is_batch' => (bool) $item->is_batch,
                'is_serialized' => (bool) $item->is_serialized,
            ],
            'filters' => [
                'store_id' => $storeId,
                'from' => $from,
                'to' => $to,
            ],
            'summary' => [
                'opening_balance' => $openingBalance,
                'total_in' => (int) $rows->sum('qty_in'),
                'total_out' => (int) $rows->sum('qty_out'),
                'closing_balance' => $rows->isNotEmpty() ? $rows->last()['running_balance'] : $openingBalance,
            ],
            'rows' => $rows->all(),
        ];
    }

    public function purchases(User $user, array $filters): array
    {
        $mode = $filters['mode'] ?? 'summary';
        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;
        $storeId = isset($filters['store_id']) && $filters['store_id'] !== ''
            ? (int) $filters['store_id']
            : null;
        $supplierCode = $filters['supplier_code'] ?? null;
        $itemCode = $filters['item_code'] ?? null;
        $search = trim((string) ($filters['search'] ?? ''));

        if ($mode === 'detail') {
            $rows = DB::table('t_purchases_details as d')
                ->join('t_purchases_sums as s', 's.Invoice_no', '=', 'd.Invoice_no')
                ->leftJoin('suppliers as sup', 'sup.Code', '=', 's.supplier_code')
                ->leftJoin('stores as st', 'st.id', '=', 's.store_id')
                ->where('s.BC', $user->BC)
                ->when($from, fn ($query, $date) => $query->whereDate('s.Invoice_date', '>=', $date))
                ->when($to, fn ($query, $date) => $query->whereDate('s.Invoice_date', '<=', $date))
                ->when($storeId, fn ($query, $id) => $query->where('s.store_id', $id))
                ->when($supplierCode, fn ($query, $code) => $query->where('s.supplier_code', $code))
                ->when($itemCode, fn ($query, $code) => $query->where('d.Item_code', $code))
                ->when($search !== '', function ($query) use ($search) {
                    $query->where(function ($nested) use ($search) {
                        $nested->where('s.Invoice_no', 'like', "%{$search}%")
                            ->orWhere('s.Ref_no', 'like', "%{$search}%")
                            ->orWhere('sup.name', 'like', "%{$search}%")
                            ->orWhere('d.Item_code', 'like', "%{$search}%")
                            ->orWhere('d.Item_description', 'like', "%{$search}%");
                    });
                })
                ->orderByDesc('s.Invoice_date')
                ->orderByDesc('d.id')
                ->get([
                    's.Invoice_no as invoice_no',
                    's.Ref_no as reference_no',
                    's.Invoice_date as invoice_date',
                    's.Customer_Name as supplier_name',
                    's.supplier_code',
                    'st.name as store_name',
                    'd.Item_code as item_code',
                    'd.Item_description as item_description',
                    'd.batch_no',
                    'd.QTY as qty',
                    'd.free_qty',
                    'd.Unit_price as unit_price',
                    'd.Sales_price as sales_price',
                    'd.Discount as discount',
                    'd.Net_value as net_value',
                    'd.serial_numbers',
                ])
                ->map(function ($row) {
                    $serials = $this->decodeJsonList($row->serial_numbers);

                    return [
                        'invoice_no' => $row->invoice_no,
                        'reference_no' => $row->reference_no,
                        'invoice_date' => $row->invoice_date,
                        'supplier_code' => $row->supplier_code,
                        'supplier_name' => $row->supplier_name,
                        'store_name' => $row->store_name ?? '—',
                        'item_code' => $row->item_code,
                        'item_description' => $row->item_description,
                        'batch_no' => $row->batch_no,
                        'qty' => (int) $row->qty,
                        'free_qty' => (int) ($row->free_qty ?? 0),
                        'received_qty' => (int) $row->qty + (int) ($row->free_qty ?? 0),
                        'unit_price' => round((float) $row->unit_price, 2),
                        'sales_price' => round((float) ($row->sales_price ?? 0), 2),
                        'discount' => round((float) $row->discount, 2),
                        'net_value' => round((float) $row->net_value, 2),
                        'serial_numbers' => $serials,
                    ];
                })
                ->values();
        } else {
            $rows = DB::table('t_purchases_sums as s')
                ->leftJoin('suppliers as sup', 'sup.Code', '=', 's.supplier_code')
                ->leftJoin('stores as st', 'st.id', '=', 's.store_id')
                ->leftJoin('t_purchases_details as d', 'd.Invoice_no', '=', 's.Invoice_no')
                ->where('s.BC', $user->BC)
                ->when($from, fn ($query, $date) => $query->whereDate('s.Invoice_date', '>=', $date))
                ->when($to, fn ($query, $date) => $query->whereDate('s.Invoice_date', '<=', $date))
                ->when($storeId, fn ($query, $id) => $query->where('s.store_id', $id))
                ->when($supplierCode, fn ($query, $code) => $query->where('s.supplier_code', $code))
                ->when($itemCode, fn ($query, $code) => $query->where('d.Item_code', $code))
                ->when($search !== '', function ($query) use ($search) {
                    $query->where(function ($nested) use ($search) {
                        $nested->where('s.Invoice_no', 'like', "%{$search}%")
                            ->orWhere('s.Ref_no', 'like', "%{$search}%")
                            ->orWhere('sup.name', 'like', "%{$search}%");
                    });
                })
                ->groupBy(
                    's.Invoice_no',
                    's.Ref_no',
                    's.Invoice_date',
                    's.supplier_code',
                    's.Customer_Name',
                    'st.name',
                    's.Net_Amount',
                    's.Discount',
                    's.paid_amount',
                    's.cash_payment',
                    's.cheque_payment',
                    's.credit_payment'
                )
                ->orderByDesc('s.Invoice_date')
                ->orderByDesc('s.id')
                ->get([
                    's.Invoice_no as invoice_no',
                    's.Ref_no as reference_no',
                    's.Invoice_date as invoice_date',
                    's.supplier_code',
                    's.Customer_Name as supplier_name',
                    'st.name as store_name',
                    's.Net_Amount as net_amount',
                    's.Discount as discount',
                    's.paid_amount',
                    's.cash_payment',
                    's.cheque_payment',
                    's.credit_payment',
                    DB::raw('COALESCE(SUM(d.QTY), 0) as qty_total'),
                    DB::raw('COALESCE(SUM(d.free_qty), 0) as free_qty_total'),
                    DB::raw('COUNT(d.id) as line_count'),
                ])
                ->map(function ($row) {
                    $paid = round((float) $row->paid_amount, 2);
                    $net = round((float) $row->net_amount, 2);
                    $balance = round($net - $paid, 2);

                    return [
                        'invoice_no' => $row->invoice_no,
                        'reference_no' => $row->reference_no,
                        'invoice_date' => $row->invoice_date,
                        'supplier_code' => $row->supplier_code,
                        'supplier_name' => $row->supplier_name,
                        'store_name' => $row->store_name ?? '—',
                        'qty_total' => (int) $row->qty_total,
                        'free_qty_total' => (int) $row->free_qty_total,
                        'line_count' => (int) $row->line_count,
                        'discount' => round((float) $row->discount, 2),
                        'net_amount' => $net,
                        'paid_amount' => $paid,
                        'balance_amount' => $balance,
                        'payment_status' => $balance <= 0.009 ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid'),
                    ];
                })
                ->values();
        }

        return [
            'mode' => $mode,
            'filters' => compact('from', 'to', 'storeId', 'supplierCode', 'itemCode', 'search'),
            'summary' => [
                'rows' => $rows->count(),
                'net_total' => round((float) $rows->sum($mode === 'detail' ? 'net_value' : 'net_amount'), 2),
            ],
            'rows' => $rows->all(),
        ];
    }

    public function sales(User $user, array $filters): array
    {
        $mode = $filters['mode'] ?? 'summary';
        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;
        $storeId = isset($filters['store_id']) && $filters['store_id'] !== ''
            ? (int) $filters['store_id']
            : null;
        $customerCode = $filters['customer_code'] ?? null;
        $itemCode = $filters['item_code'] ?? null;
        $search = trim((string) ($filters['search'] ?? ''));

        if ($mode === 'detail') {
            $rows = DB::table('t_invoice_deils as d')
                ->join('t_invoice_sums as s', 's.Invoice_no', '=', 'd.Invoice_no')
                ->leftJoin('customers as c', 'c.Code', '=', 's.customer_code')
                ->leftJoin('stores as st', 'st.id', '=', 's.store_id')
                ->where('s.BC', $user->BC)
                ->when($from, fn ($query, $date) => $query->whereDate('s.Invoice_date', '>=', $date))
                ->when($to, fn ($query, $date) => $query->whereDate('s.Invoice_date', '<=', $date))
                ->when($storeId, fn ($query, $id) => $query->where('s.store_id', $id))
                ->when($customerCode, fn ($query, $code) => $query->where('s.customer_code', $code))
                ->when($itemCode, fn ($query, $code) => $query->where('d.Item_code', $code))
                ->when($search !== '', function ($query) use ($search) {
                    $query->where(function ($nested) use ($search) {
                        $nested->where('s.Invoice_no', 'like', "%{$search}%")
                            ->orWhere('s.reference_no', 'like', "%{$search}%")
                            ->orWhere('s.Customer_Name', 'like', "%{$search}%")
                            ->orWhere('d.Item_code', 'like', "%{$search}%")
                            ->orWhere('d.Item_description', 'like', "%{$search}%");
                    });
                })
                ->orderByDesc('s.Invoice_date')
                ->orderByDesc('d.id')
                ->get([
                    's.Invoice_no as invoice_no',
                    's.reference_no',
                    's.Invoice_date as invoice_date',
                    's.customer_code',
                    's.Customer_Name as customer_name',
                    's.payment_status',
                    'st.name as store_name',
                    'd.Item_code as item_code',
                    'd.Item_description as item_description',
                    'd.batch_no',
                    'd.QTY as qty',
                    'd.Unit_price as unit_price',
                    'd.Discount as discount',
                    'd.Net_value as net_value',
                    'd.serial_numbers',
                ])
                ->map(function ($row) {
                    return [
                        'invoice_no' => $row->invoice_no,
                        'reference_no' => $row->reference_no,
                        'invoice_date' => $row->invoice_date,
                        'customer_code' => $row->customer_code,
                        'customer_name' => $row->customer_name,
                        'payment_status' => $row->payment_status,
                        'store_name' => $row->store_name ?? '—',
                        'item_code' => $row->item_code,
                        'item_description' => $row->item_description,
                        'batch_no' => $row->batch_no,
                        'qty' => (int) $row->qty,
                        'unit_price' => round((float) $row->unit_price, 2),
                        'discount' => round((float) $row->discount, 2),
                        'net_value' => round((float) $row->net_value, 2),
                        'serial_numbers' => $this->decodeJsonList($row->serial_numbers),
                    ];
                })
                ->values();
        } else {
            $rows = DB::table('t_invoice_sums as s')
                ->leftJoin('customers as c', 'c.Code', '=', 's.customer_code')
                ->leftJoin('stores as st', 'st.id', '=', 's.store_id')
                ->leftJoin('t_invoice_deils as d', 'd.Invoice_no', '=', 's.Invoice_no')
                ->where('s.BC', $user->BC)
                ->when($from, fn ($query, $date) => $query->whereDate('s.Invoice_date', '>=', $date))
                ->when($to, fn ($query, $date) => $query->whereDate('s.Invoice_date', '<=', $date))
                ->when($storeId, fn ($query, $id) => $query->where('s.store_id', $id))
                ->when($customerCode, fn ($query, $code) => $query->where('s.customer_code', $code))
                ->when($itemCode, fn ($query, $code) => $query->where('d.Item_code', $code))
                ->when($search !== '', function ($query) use ($search) {
                    $query->where(function ($nested) use ($search) {
                        $nested->where('s.Invoice_no', 'like', "%{$search}%")
                            ->orWhere('s.reference_no', 'like', "%{$search}%")
                            ->orWhere('s.Customer_Name', 'like', "%{$search}%")
                            ->orWhere('s.Customer_NIC', 'like', "%{$search}%");
                    });
                })
                ->groupBy(
                    's.Invoice_no',
                    's.reference_no',
                    's.Invoice_date',
                    's.customer_code',
                    's.Customer_Name',
                    's.Customer_NIC',
                    's.payment_status',
                    'st.name',
                    's.Net_Amount',
                    's.Discount',
                    's.paid_amount',
                    's.Cash_Pay',
                    's.card_payment',
                    's.Cheque',
                    's.bank_transfer',
                    's.Credite',
                    's.advance_applied'
                )
                ->orderByDesc('s.Invoice_date')
                ->orderByDesc('s.id')
                ->get([
                    's.Invoice_no as invoice_no',
                    's.reference_no',
                    's.Invoice_date as invoice_date',
                    's.customer_code',
                    's.Customer_Name as customer_name',
                    's.Customer_NIC as customer_nic',
                    's.payment_status',
                    'st.name as store_name',
                    's.Net_Amount as net_amount',
                    's.Discount as discount',
                    's.paid_amount',
                    's.Cash_Pay as cash_payment',
                    's.card_payment',
                    's.Cheque as cheque_payment',
                    's.bank_transfer',
                    's.Credite as credit_amount',
                    's.advance_applied',
                    DB::raw('COALESCE(SUM(d.QTY), 0) as qty_total'),
                    DB::raw('COUNT(d.id) as line_count'),
                ])
                ->map(function ($row) {
                    return [
                        'invoice_no' => $row->invoice_no,
                        'reference_no' => $row->reference_no,
                        'invoice_date' => $row->invoice_date,
                        'customer_code' => $row->customer_code,
                        'customer_name' => $row->customer_name,
                        'customer_nic' => $row->customer_nic,
                        'payment_status' => $row->payment_status,
                        'store_name' => $row->store_name ?? '—',
                        'qty_total' => (int) $row->qty_total,
                        'line_count' => (int) $row->line_count,
                        'discount' => round((float) $row->discount, 2),
                        'net_amount' => round((float) $row->net_amount, 2),
                        'paid_amount' => round((float) $row->paid_amount, 2),
                        'credit_amount' => round((float) $row->credit_amount, 2),
                        'advance_applied' => round((float) ($row->advance_applied ?? 0), 2),
                        'cash_payment' => round((float) $row->cash_payment, 2),
                        'card_payment' => round((float) ($row->card_payment ?? 0), 2),
                        'cheque_payment' => round((float) $row->cheque_payment, 2),
                        'bank_transfer' => round((float) $row->bank_transfer, 2),
                    ];
                })
                ->values();
        }

        return [
            'mode' => $mode,
            'filters' => compact('from', 'to', 'storeId', 'customerCode', 'itemCode', 'search'),
            'summary' => [
                'rows' => $rows->count(),
                'net_total' => round((float) $rows->sum($mode === 'detail' ? 'net_value' : 'net_amount'), 2),
            ],
            'rows' => $rows->all(),
        ];
    }

    public function hirePurchase(User $user, array $filters): array
    {
        $mode = $filters['mode'] ?? 'summary';
        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;
        $storeId = isset($filters['store_id']) && $filters['store_id'] !== ''
            ? (int) $filters['store_id']
            : null;
        $customerCode = $filters['customer_code'] ?? null;
        $itemCode = $filters['item_code'] ?? null;
        $status = $filters['status'] ?? null;
        $search = trim((string) ($filters['search'] ?? ''));

        if ($mode === 'detail') {
            $rows = DB::table('t_hire_purchase_details as d')
                ->join('t_hire_purchase_sums as h', 'h.invoice_no', '=', 'd.invoice_no')
                ->leftJoin('stores as st', 'st.id', '=', 'h.store_id')
                ->where('h.BC', $user->BC)
                ->when($from, fn ($query, $date) => $query->whereDate('h.invoice_date', '>=', $date))
                ->when($to, fn ($query, $date) => $query->whereDate('h.invoice_date', '<=', $date))
                ->when($storeId, fn ($query, $id) => $query->where('h.store_id', $id))
                ->when($customerCode, fn ($query, $code) => $query->where('h.customer_code', $code))
                ->when($itemCode, fn ($query, $code) => $query->where('d.item_code', $code))
                ->when($status, fn ($query, $value) => $query->where('h.status', $value))
                ->when($search !== '', function ($query) use ($search) {
                    $query->where(function ($nested) use ($search) {
                        $nested->where('h.invoice_no', 'like', "%{$search}%")
                            ->orWhere('h.agreement_no', 'like', "%{$search}%")
                            ->orWhere('h.customer_name', 'like', "%{$search}%")
                            ->orWhere('h.customer_nic', 'like', "%{$search}%")
                            ->orWhere('d.item_code', 'like', "%{$search}%")
                            ->orWhere('d.item_description', 'like', "%{$search}%");
                    });
                })
                ->orderByDesc('h.invoice_date')
                ->orderByDesc('d.id')
                ->get([
                    'h.invoice_no',
                    'h.agreement_no',
                    'h.invoice_date',
                    'h.customer_code',
                    'h.customer_name',
                    'h.customer_nic',
                    'h.schema_type',
                    'h.status',
                    'st.name as store_name',
                    'd.item_code',
                    'd.item_description',
                    'd.batch_no',
                    'd.qty',
                    'd.returned_qty',
                    'd.unit_price',
                    'd.discount',
                    'd.net_value',
                    'd.serial_numbers',
                ])
                ->map(function ($row) {
                    return [
                        'invoice_no' => $row->invoice_no,
                        'agreement_no' => $row->agreement_no,
                        'invoice_date' => $row->invoice_date,
                        'customer_code' => $row->customer_code,
                        'customer_name' => $row->customer_name,
                        'customer_nic' => $row->customer_nic,
                        'schema_type' => $row->schema_type,
                        'status' => $row->status,
                        'store_name' => $row->store_name ?? '—',
                        'item_code' => $row->item_code,
                        'item_description' => $row->item_description,
                        'batch_no' => $row->batch_no,
                        'qty' => (int) $row->qty,
                        'returned_qty' => (int) ($row->returned_qty ?? 0),
                        'unit_price' => round((float) $row->unit_price, 2),
                        'discount' => round((float) $row->discount, 2),
                        'net_value' => round((float) $row->net_value, 2),
                        'serial_numbers' => $this->decodeJsonList($row->serial_numbers),
                    ];
                })
                ->values();
        } else {
            $rows = DB::table('t_hire_purchase_sums as h')
                ->leftJoin('stores as st', 'st.id', '=', 'h.store_id')
                ->leftJoin('t_hire_purchase_details as d', 'd.invoice_no', '=', 'h.invoice_no')
                ->where('h.BC', $user->BC)
                ->when($from, fn ($query, $date) => $query->whereDate('h.invoice_date', '>=', $date))
                ->when($to, fn ($query, $date) => $query->whereDate('h.invoice_date', '<=', $date))
                ->when($storeId, fn ($query, $id) => $query->where('h.store_id', $id))
                ->when($customerCode, fn ($query, $code) => $query->where('h.customer_code', $code))
                ->when($itemCode, fn ($query, $code) => $query->where('d.item_code', $code))
                ->when($status, fn ($query, $value) => $query->where('h.status', $value))
                ->when($search !== '', function ($query) use ($search) {
                    $query->where(function ($nested) use ($search) {
                        $nested->where('h.invoice_no', 'like', "%{$search}%")
                            ->orWhere('h.agreement_no', 'like', "%{$search}%")
                            ->orWhere('h.customer_name', 'like', "%{$search}%")
                            ->orWhere('h.customer_nic', 'like', "%{$search}%");
                    });
                })
                ->groupBy(
                    'h.invoice_no',
                    'h.agreement_no',
                    'h.invoice_date',
                    'h.customer_code',
                    'h.customer_name',
                    'h.customer_nic',
                    'h.schema_type',
                    'h.status',
                    'st.name',
                    'h.net_amount',
                    'h.contract_amount',
                    'h.down_payment',
                    'h.advance_applied',
                    'h.paid_amount',
                    'h.outstanding_amount',
                    'h.returned_amount'
                )
                ->orderByDesc('h.invoice_date')
                ->orderByDesc('h.id')
                ->get([
                    'h.invoice_no',
                    'h.agreement_no',
                    'h.invoice_date',
                    'h.customer_code',
                    'h.customer_name',
                    'h.customer_nic',
                    'h.schema_type',
                    'h.status',
                    'st.name as store_name',
                    'h.net_amount',
                    'h.contract_amount',
                    'h.down_payment',
                    'h.advance_applied',
                    'h.paid_amount',
                    'h.outstanding_amount',
                    'h.returned_amount',
                    DB::raw('COALESCE(SUM(d.qty), 0) as qty_total'),
                    DB::raw('COUNT(d.id) as line_count'),
                ])
                ->map(function ($row) {
                    return [
                        'invoice_no' => $row->invoice_no,
                        'agreement_no' => $row->agreement_no,
                        'invoice_date' => $row->invoice_date,
                        'customer_code' => $row->customer_code,
                        'customer_name' => $row->customer_name,
                        'customer_nic' => $row->customer_nic,
                        'schema_type' => $row->schema_type,
                        'status' => $row->status,
                        'store_name' => $row->store_name ?? '—',
                        'qty_total' => (int) $row->qty_total,
                        'line_count' => (int) $row->line_count,
                        'net_amount' => round((float) $row->net_amount, 2),
                        'contract_amount' => round((float) $row->contract_amount, 2),
                        'down_payment' => round((float) $row->down_payment, 2),
                        'advance_applied' => round((float) ($row->advance_applied ?? 0), 2),
                        'paid_amount' => round((float) $row->paid_amount, 2),
                        'outstanding_amount' => round((float) $row->outstanding_amount, 2),
                        'returned_amount' => round((float) $row->returned_amount, 2),
                    ];
                })
                ->values();
        }

        return [
            'mode' => $mode,
            'filters' => compact('from', 'to', 'storeId', 'customerCode', 'itemCode', 'status', 'search'),
            'summary' => [
                'rows' => $rows->count(),
                'net_total' => round((float) $rows->sum($mode === 'detail' ? 'net_value' : 'net_amount'), 2),
            ],
            'rows' => $rows->all(),
        ];
    }

    public function cashFlow(User $user, array $filters): array
    {
        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;
        $accountCode = (string) ($filters['account_code'] ?? AccountingService::CASH);

        $account = MChartofAccount::query()
            ->where('BC', $user->BC)
            ->where('code', $accountCode)
            ->firstOrFail();

        $base = TAccountTran::query()
            ->where('BC', $user->BC)
            ->where('AccCode', $accountCode);

        $openingBalance = $from
            ? round((float) (clone $base)->whereDate('Ddate', '<', $from)->sum(DB::raw('dr_amount - cr_amount')), 2)
            : 0;

        $rows = (clone $base)
            ->with('account')
            ->when($from, fn ($query, $date) => $query->whereDate('Ddate', '>=', $date))
            ->when($to, fn ($query, $date) => $query->whereDate('Ddate', '<=', $date))
            ->orderBy('Ddate')
            ->orderBy('id')
            ->get();

        $counterparts = TAccountTran::query()
            ->join('m_chartof_accounts as coa', 'coa.code', '=', 't_account_trans.AccCode')
            ->where('t_account_trans.BC', $user->BC)
            ->whereIn('t_account_trans.trance_no', $rows->pluck('trance_no')->unique())
            ->whereIn('t_account_trans.trance_type', $rows->pluck('trance_type')->unique())
            ->where('t_account_trans.AccCode', '!=', $accountCode)
            ->get([
                't_account_trans.trance_no',
                't_account_trans.trance_type',
                'coa.code',
                'coa.description',
            ])
            ->groupBy(fn ($row) => "{$row->trance_type}|{$row->trance_no}");

        $runningBalance = $openingBalance;
        $mappedRows = $rows->map(function (TAccountTran $row) use (&$runningBalance, $counterparts) {
            $runningBalance += round((float) $row->dr_amount - (float) $row->cr_amount, 2);
            $relatedAccounts = $counterparts
                ->get("{$row->trance_type}|{$row->trance_no}", collect())
                ->map(fn ($account) => "{$account->code} {$account->description}")
                ->unique()
                ->values()
                ->all();

            return [
                'date' => Carbon::parse($row->Ddate)->format('Y-m-d'),
                'trance_type' => $row->trance_type,
                'trance_no' => $row->trance_no,
                'reference_no' => $row->no,
                'cash_in' => round((float) $row->dr_amount, 2),
                'cash_out' => round((float) $row->cr_amount, 2),
                'running_balance' => $runningBalance,
                'counterpart_accounts' => $relatedAccounts,
                'uid' => $row->UID,
            ];
        })->values();

        return [
            'account' => [
                'code' => $account->code,
                'description' => $account->description,
            ],
            'filters' => compact('from', 'to'),
            'summary' => [
                'opening_balance' => $openingBalance,
                'cash_in' => round((float) $mappedRows->sum('cash_in'), 2),
                'cash_out' => round((float) $mappedRows->sum('cash_out'), 2),
                'closing_balance' => $mappedRows->isNotEmpty() ? $mappedRows->last()['running_balance'] : $openingBalance,
            ],
            'rows' => $mappedRows->all(),
        ];
    }

    public function dayEndPreview(User $user, string $date): array
    {
        $previous = DayEndBalance::query()
            ->where('BC', $user->BC)
            ->whereDate('close_date', '<', $date)
            ->orderByDesc('close_date')
            ->first();
        $opening = round((float) ($previous?->closing_balance ?? 0), 2);
        $cashTransactions = TAccountTran::query()
            ->where('BC', $user->BC)
            ->where('AccCode', AccountingService::CASH)
            ->whereDate('Ddate', $date);
        $cashIn = round((float) (clone $cashTransactions)->sum('dr_amount'), 2);
        $cashOut = round((float) (clone $cashTransactions)->sum('cr_amount'), 2);
        $allTransactions = TAccountTran::query()
            ->where('BC', $user->BC)
            ->whereDate('Ddate', $date);
        $totalDebits = round((float) (clone $allTransactions)->sum('dr_amount'), 2);
        $totalCredits = round((float) (clone $allTransactions)->sum('cr_amount'), 2);

        return [
            'date' => $date,
            'opening_balance' => $opening,
            'cash_in' => $cashIn,
            'cash_out' => $cashOut,
            'expected_closing' => round($opening + $cashIn - $cashOut, 2),
            'total_debits' => $totalDebits,
            'total_credits' => $totalCredits,
            'trial_balance_difference' => round($totalDebits - $totalCredits, 2),
            'already_closed' => DayEndBalance::query()
                ->where('BC', $user->BC)
                ->whereDate('close_date', $date)
                ->exists(),
        ];
    }

    public function closeDay(User $user, array $data): DayEndBalance
    {
        return DB::transaction(function () use ($user, $data) {
            $date = Carbon::parse($data['close_date'])->format('Y-m-d');
            if (Carbon::parse($date)->isFuture()) {
                throw ValidationException::withMessages(['close_date' => 'A future business day cannot be closed.']);
            }
            if (DayEndBalance::query()->where('BC', $user->BC)->whereDate('close_date', $date)->exists()) {
                throw ValidationException::withMessages(['close_date' => 'This business day is already closed.']);
            }
            $latest = DayEndBalance::query()->where('BC', $user->BC)->orderByDesc('close_date')->first();
            if ($latest && Carbon::parse($date)->lte($latest->close_date)) {
                throw ValidationException::withMessages(['close_date' => 'Close days in chronological order.']);
            }

            $preview = $this->dayEndPreview($user, $date);
            if (abs((float) $preview['trial_balance_difference']) > 0.009) {
                throw ValidationException::withMessages(['ledger' => 'The ledger is not balanced for this date.']);
            }
            $counted = round((float) $data['counted_cash'], 2);

            return DayEndBalance::create([
                'BC' => $user->BC,
                'close_date' => $date,
                'opening_balance' => $preview['opening_balance'],
                'closing_balance' => $preview['expected_closing'],
                'counted_cash' => $counted,
                'variance' => round($counted - (float) $preview['expected_closing'], 2),
                'total_dr' => $preview['total_debits'],
                'total_cr' => $preview['total_credits'],
                'notes' => $data['notes'] ?? null,
                'closed_by' => $user->id,
            ]);
        });
    }

    private function dailyTotals(
        string $table,
        string $dateColumn,
        string $amountColumn,
        string $branch,
        string $from,
        string $to
    ): Collection {
        return DB::table($table)
            ->selectRaw("{$dateColumn} as report_date, SUM({$amountColumn}) as total")
            ->where('BC', $branch)
            ->whereBetween($dateColumn, [$from, $to])
            ->groupBy($dateColumn)
            ->get()
            ->map(fn ($row) => ['date' => $row->report_date, 'total' => (float) $row->total]);
    }

    private function movementLabel(string $transCode): string
    {
        return match ($transCode) {
            'OPS' => 'Opening stock',
            'GRN' => 'Goods received',
            'TRF-IN' => 'Transfer in',
            'TRF-OUT' => 'Transfer out',
            'INV' => 'Sales invoice',
            'SAL-RET' => 'Sales return',
            'HP-SALE' => 'Hire purchase issue',
            'HP-RET' => 'Hire purchase return',
            default => $transCode,
        };
    }

    private function decodeJsonList(mixed $value): array
    {
        if (is_array($value)) {
            return array_values(array_filter($value, fn ($item) => filled($item)));
        }

        if (! is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);

        return is_array($decoded)
            ? array_values(array_filter($decoded, fn ($item) => filled($item)))
            : [];
    }
}
