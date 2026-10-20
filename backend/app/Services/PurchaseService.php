<?php

namespace App\Services;

use App\Models\BankDetail;
use App\Models\Item;
use App\Models\Supplier;
use App\Models\TPurchaseOrderSum;
use App\Models\TPurchasesDetail;
use App\Models\TPurchasesOrderDetail;
use App\Models\TPurchasesSum;
use App\Models\TSupPurchaseTrance;
use App\Models\TSupplierInvoicePayment;
use App\Models\TSupplierPayment;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PurchaseService
{
    public function __construct(
        private readonly StockService $stockService,
        private readonly AccountingService $accountingService,
        private readonly ChequeEntryService $chequeEntryService
    ) {}

    public function createOrder(array $data, User $user): TPurchaseOrderSum
    {
        return DB::transaction(function () use ($data, $user) {
            $supplier = $this->findSupplier($data['supplier_code'], $user->BC);
            $items = $this->findItems($data['items'], $user->BC);
            $poNo = $this->nextNumber('PO', $user->BC, TPurchaseOrderSum::class, 'po_no');
            [$grossAmount, $lines] = $this->prepareOrderLines($data['items'], $items);

            $order = TPurchaseOrderSum::create([
                'po_no' => $poNo,
                'po_date' => $data['po_date'],
                'expected_date' => $data['expected_date'] ?? null,
                'supplier_code' => $supplier->Code,
                'gross_amount' => $grossAmount,
                'net_amount' => $grossAmount,
                'status' => 'draft',
                'notes' => $data['notes'] ?? null,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            foreach ($lines as $line) {
                $order->details()->create([
                    ...$line,
                    'po_no' => $poNo,
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]);
            }

            return $order->load(['supplier', 'details.item']);
        });
    }

    public function updateOrder(
        TPurchaseOrderSum $order,
        array $data,
        User $user
    ): TPurchaseOrderSum {
        if ($order->status !== 'draft') {
            throw ValidationException::withMessages([
                'status' => 'Only draft purchase orders can be edited.',
            ]);
        }

        return DB::transaction(function () use ($order, $data, $user) {
            $supplier = $this->findSupplier($data['supplier_code'], $user->BC);
            $items = $this->findItems($data['items'], $user->BC);
            [$grossAmount, $lines] = $this->prepareOrderLines($data['items'], $items);

            $order->update([
                'po_date' => $data['po_date'],
                'expected_date' => $data['expected_date'] ?? null,
                'supplier_code' => $supplier->Code,
                'gross_amount' => $grossAmount,
                'net_amount' => $grossAmount,
                'notes' => $data['notes'] ?? null,
                'UID' => $user->username,
            ]);

            $order->details()->delete();

            foreach ($lines as $line) {
                $order->details()->create([
                    ...$line,
                    'po_no' => $order->po_no,
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]);
            }

            return $order->refresh()->load(['supplier', 'details.item']);
        });
    }

    public function approveOrder(
        TPurchaseOrderSum $order,
        User $user
    ): TPurchaseOrderSum {
        if ($order->status !== 'draft') {
            throw ValidationException::withMessages([
                'status' => 'Only draft purchase orders can be approved.',
            ]);
        }

        $order->update([
            'status' => 'approved',
            'UID' => $user->username,
        ]);

        return $order->refresh()->load(['supplier', 'details.item']);
    }

    public function cancelOrder(
        TPurchaseOrderSum $order,
        User $user
    ): TPurchaseOrderSum {
        if (in_array($order->status, ['partially_received', 'received'], true)) {
            throw ValidationException::withMessages([
                'status' => 'An order with received stock cannot be cancelled.',
            ]);
        }

        $order->update([
            'status' => 'cancelled',
            'UID' => $user->username,
        ]);

        return $order->refresh()->load(['supplier', 'details.item']);
    }

    public function deleteOrder(TPurchaseOrderSum $order): void
    {
        if ($order->status !== 'draft') {
            throw ValidationException::withMessages([
                'status' => 'Only draft purchase orders can be deleted.',
            ]);
        }

        $order->delete();
    }

    public function createReceipt(array $data, User $user): TPurchasesSum
    {
        return DB::transaction(function () use ($data, $user) {
            $supplier = $this->findSupplier($data['supplier_code'], $user->BC);
            $items = $this->findItems($data['items'], $user->BC);
            $order = null;

            if (! empty($data['purchase_order_no'])) {
                $order = TPurchaseOrderSum::query()
                    ->where('po_no', $data['purchase_order_no'])
                    ->where('BC', $user->BC)
                    ->lockForUpdate()
                    ->firstOrFail();

                if ($order->supplier_code !== $supplier->Code) {
                    throw ValidationException::withMessages([
                        'purchase_order_no' => 'The purchase order belongs to another supplier.',
                    ]);
                }

                if (! in_array($order->status, ['approved', 'partially_received'], true)) {
                    throw ValidationException::withMessages([
                        'purchase_order_no' => 'Only approved purchase orders can be received.',
                    ]);
                }
            }

            $invoiceNo = $this->nextNumber('GRN', $user->BC, TPurchasesSum::class, 'Invoice_no');
            $grossAmount = 0.0;
            $preparedLines = [];

            foreach ($data['items'] as $index => $line) {
                $item = $items->get($line['item_code']);
                $qty = (int) $line['qty'];
                $freeQty = (int) ($line['free_qty'] ?? 0);
                $receivedQty = $qty + $freeQty;
                $unitPrice = round((float) $line['unit_price'], 2);
                $lineGross = round($qty * $unitPrice, 2);
                $discountType = $line['discount_type'] ?? 'amount';
                $discountValue = round((float) ($line['discount'] ?? 0), 2);
                $discount = $this->resolveDiscountAmount(
                    $lineGross,
                    $discountValue,
                    $discountType,
                    "items.{$index}.discount"
                );
                $netValue = round($lineGross - $discount, 2);

                if ($netValue < 0) {
                    throw ValidationException::withMessages([
                        "items.{$index}.discount" => 'Line discount cannot exceed the line value.',
                    ]);
                }

                if ($order) {
                    $orderDetail = TPurchasesOrderDetail::query()
                        ->where('po_no', $order->po_no)
                        ->where('item_code', $item->item_code)
                        ->lockForUpdate()
                        ->first();

                    if (! $orderDetail) {
                        throw ValidationException::withMessages([
                            "items.{$index}.item_code" => 'This item is not on the selected purchase order.',
                        ]);
                    }

                    $remainingQty = $orderDetail->qty - $orderDetail->received_qty;
                    if ($qty > $remainingQty) {
                        throw ValidationException::withMessages([
                            "items.{$index}.qty" => "Only {$remainingQty} units remain on the purchase order.",
                        ]);
                    }
                }

                $salesPrice = $item->is_batch
                    ? round((float) ($line['sales_price'] ?? 0), 2)
                    : (float) $item->standard_sales_price;

                if ($item->is_batch && $salesPrice <= 0) {
                    throw ValidationException::withMessages([
                        "items.{$index}.sales_price" => 'A sales price is required for batch-tracked items.',
                    ]);
                }

                $preparedLines[] = [
                    'index' => $index,
                    'item' => $item,
                    'qty' => $qty,
                    'free_qty' => $freeQty,
                    'received_qty' => $receivedQty,
                    'unit_price' => $unitPrice,
                    'sales_price' => $salesPrice,
                    'discount' => $discount,
                    'discount_type' => $discountType,
                    'discount_value' => $discountValue,
                    'net_value' => $netValue,
                    'batch_no' => $line['batch_no'] ?? null,
                    'price_mode' => $line['price_mode'] ?? ($item->default_batch_price_mode ?: 'batch'),
                    'serial_numbers' => $line['serial_numbers'] ?? [],
                ];
                $grossAmount += $lineGross;
            }

            $lineDiscounts = collect($preparedLines)->sum('discount');
            $headerDiscountType = $data['discount_type'] ?? 'amount';
            $headerDiscountValue = round((float) ($data['discount'] ?? 0), 2);
            $headerDiscount = $this->resolveDiscountAmount(
                round($grossAmount - $lineDiscounts, 2),
                $headerDiscountValue,
                $headerDiscountType,
                'discount'
            );
            $netAmount = round($grossAmount - $lineDiscounts - $headerDiscount, 2);

            if ($netAmount < 0) {
                throw ValidationException::withMessages([
                    'discount' => 'Discount cannot exceed the receipt gross amount.',
                ]);
            }

            $cashPayment = round((float) ($data['cash_payment'] ?? 0), 2);
            $chequePayment = round((float) ($data['cheque_payment'] ?? 0), 2);
            $paidAmount = $cashPayment + $chequePayment;

            if ($paidAmount > $netAmount) {
                throw ValidationException::withMessages([
                    'cash_payment' => 'Immediate payments cannot exceed the receipt net amount.',
                ]);
            }

            $creditPayment = round($netAmount - $paidAmount, 2);
            $paymentStatus = $creditPayment <= 0
                ? 'paid'
                : ($paidAmount > 0 ? 'partial' : 'unpaid');

            $receipt = TPurchasesSum::create([
                'Invoice_no' => $invoiceNo,
                'Ref_no' => $data['reference_no'] ?? null,
                'Invoice_date' => $data['invoice_date'],
                'supplier_code' => $supplier->Code,
                'purchase_order_no' => $order?->po_no,
                'store_id' => $data['store_id'],
                'Customer_NIC' => $supplier->Code,
                'Customer_Name' => $supplier->name,
                'Customer_Phone' => $supplier->phone,
                'Gross_Amount' => $grossAmount,
                'Discount' => $lineDiscounts + $headerDiscount,
                'discount_type' => $headerDiscountType,
                'discount_value' => $headerDiscountValue,
                'Net_Amount' => $netAmount,
                'cash_payment' => $cashPayment,
                'credit_payment' => $creditPayment,
                'cheque_payment' => $chequePayment,
                'paid_amount' => $paidAmount,
                'payment_status' => $paymentStatus,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            foreach ($preparedLines as $line) {
                TPurchasesDetail::create([
                    'Invoice_no' => $invoiceNo,
                    'Ref_no' => $data['reference_no'] ?? null,
                    'Invoice_date' => $data['invoice_date'],
                    'Item_code' => $line['item']->item_code,
                    'Item_description' => $line['item']->item_description,
                    'batch_no' => $line['batch_no'],
                    'store_id' => $data['store_id'],
                    'QTY' => $line['qty'],
                    'free_qty' => $line['free_qty'],
                    'Unit_price' => $line['unit_price'],
                    'Sales_price' => $line['sales_price'],
                    'serial_numbers' => $line['serial_numbers'],
                    'Discount' => $line['discount'],
                    'discount_type' => $line['discount_type'],
                    'discount_value' => $line['discount_value'],
                    'Net_value' => $line['net_value'],
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]);

                try {
                    $this->stockService->receiveStock(
                        $invoiceNo,
                        'GRN',
                        $line['item']->item_code,
                        $line['batch_no'],
                        (int) $data['store_id'],
                        $line['received_qty'],
                        $line['unit_price'],
                        $line['sales_price'],
                        $user->BC,
                        $user->username,
                        $line['serial_numbers']
                    );
                } catch (\InvalidArgumentException|\RuntimeException $exception) {
                    throw ValidationException::withMessages([
                        "items.{$line['index']}.item_code" => $exception->getMessage(),
                    ]);
                }

                if (
                    $line['item']->is_batch
                    && in_array($line['price_mode'], ['batch', 'average', 'last'], true)
                    && $line['item']->default_batch_price_mode !== $line['price_mode']
                ) {
                    $line['item']->forceFill([
                        'default_batch_price_mode' => $line['price_mode'],
                    ])->save();
                }

                if ($order) {
                    TPurchasesOrderDetail::query()
                        ->where('po_no', $order->po_no)
                        ->where('item_code', $line['item']->item_code)
                        ->increment('received_qty', $line['qty']);
                }
            }

            $this->recordSupplierLedger(
                $invoiceNo,
                $supplier->Code,
                0,
                $netAmount,
                'PURCHASE',
                $data['invoice_date'],
                $user
            );

            if ($paidAmount > 0) {
                $this->recordSupplierLedger(
                    $invoiceNo.'-PAID',
                    $supplier->Code,
                    $paidAmount,
                    0,
                    'PURCHASE_PAYMENT',
                    $data['invoice_date'],
                    $user
                );
            }

            if ($chequePayment > 0) {
                $this->createSupplierCheque(
                    $invoiceNo,
                    'PURCHASE',
                    $data['invoice_date'],
                    $chequePayment,
                    $data['cheque'] ?? [],
                    $user
                );
            }

            if ($order) {
                $this->refreshOrderStatus($order);
            }

            return $receipt->load([
                'supplier',
                'order',
                'store',
                'details.item',
            ]);
        });
    }

    public function updateReceiptSerials(
        TPurchasesSum $receipt,
        int $detailId,
        array $serialNumbers,
        User $user
    ): TPurchasesSum {
        if ($receipt->BC !== $user->BC) {
            abort(404);
        }

        return DB::transaction(function () use ($receipt, $detailId, $serialNumbers, $user) {
            /** @var TPurchasesDetail|null $detail */
            $detail = $receipt->details()
                ->whereKey($detailId)
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->first();

            if (! $detail) {
                throw ValidationException::withMessages([
                    'detail_id' => 'Purchase receipt detail was not found.',
                ]);
            }

            if (! $detail->item?->is_serialized) {
                throw ValidationException::withMessages([
                    'detail_id' => 'Only serialized receipt lines can be edited.',
                ]);
            }

            $serials = $this->stockService->replaceReceivedSerials(
                $receipt->Invoice_no,
                'GRN',
                $detail->Item_code,
                (int) $detail->store_id,
                $serialNumbers,
                $user->BC,
                $user->username
            );

            $detail->serial_numbers = $serials;
            $detail->UID = $user->username;
            $detail->save();

            return $receipt->refresh()->load(['supplier', 'order', 'store', 'details.item']);
        });
    }


    public function createPayment(array $data, User $user): TSupplierPayment
    {
        return DB::transaction(function () use ($data, $user) {
            $supplier = $this->findSupplier($data['supplier_code'], $user->BC);
            $paymentAmount = round((float) $data['payment_amount'], 2);
            $methodTotal = round(
                (float) ($data['cash_payment'] ?? 0)
                + (float) ($data['card_payment'] ?? 0)
                + (float) ($data['cheque_payment'] ?? 0)
                + (float) ($data['bank_transfer'] ?? 0),
                2
            );
            $allocationTotal = round(
                collect($data['allocations'])->sum('amount'),
                2
            );
            $bankDetailId = $this->resolveBankDetailId($data, $user);

            if (abs($paymentAmount - $methodTotal) > 0.009) {
                throw ValidationException::withMessages([
                    'payment_amount' => 'Payment methods must add up to the payment amount.',
                ]);
            }

            if (abs($paymentAmount - $allocationTotal) > 0.009) {
                throw ValidationException::withMessages([
                    'allocations' => 'Invoice allocations must add up to the payment amount.',
                ]);
            }

            $paymentNo = $this->nextNumber('SP', $user->BC, TSupplierPayment::class, 'Payment_no');
            $purchases = collect();

            foreach ($data['allocations'] as $index => $allocation) {
                $purchase = TPurchasesSum::query()
                    ->where('Invoice_no', $allocation['purchase_invoice_no'])
                    ->where('supplier_code', $supplier->Code)
                    ->where('BC', $user->BC)
                    ->lockForUpdate()
                    ->first();

                if (! $purchase) {
                    throw ValidationException::withMessages([
                        "allocations.{$index}.purchase_invoice_no" => 'Purchase invoice not found for this supplier.',
                    ]);
                }

                $outstanding = $this->purchaseOutstanding($purchase);
                if ((float) $allocation['amount'] > $outstanding + 0.009) {
                    throw ValidationException::withMessages([
                        "allocations.{$index}.amount" => "Only {$outstanding} remains outstanding on {$purchase->Invoice_no}.",
                    ]);
                }

                $purchases->put($purchase->Invoice_no, $purchase);
            }

            $payment = TSupplierPayment::create([
                'Payment_no' => $paymentNo,
                'Payment_date' => $data['payment_date'],
                'Supplier_Code' => $supplier->Code,
                'Supplier_Name' => $supplier->name,
                'Supplier_Phone' => $supplier->phone,
                'Payment_note' => $data['payment_note'] ?? null,
                'Payment_Amount' => $paymentAmount,
                'cash_payment' => $data['cash_payment'] ?? 0,
                'card_payment' => $data['card_payment'] ?? 0,
                'cheque_payment' => $data['cheque_payment'] ?? 0,
                'bank_transfer' => $data['bank_transfer'] ?? 0,
                'bank_detail_id' => $bankDetailId,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            foreach ($data['allocations'] as $allocation) {
                TSupplierInvoicePayment::create([
                    'payment_no' => $paymentNo,
                    'purchase_invoice_no' => $allocation['purchase_invoice_no'],
                    'amount_allocated' => $allocation['amount'],
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]);

                $purchase = $purchases->get($allocation['purchase_invoice_no']);
                $purchase->paid_amount = round(
                    (float) $purchase->paid_amount + (float) $allocation['amount'],
                    2
                );
                $outstandingAfter = round(
                    (float) $purchase->Net_Amount - (float) $purchase->paid_amount,
                    2
                );
                $purchase->payment_status = $outstandingAfter <= 0.009
                    ? 'paid'
                    : 'partial';
                $purchase->save();
            }

            $this->recordSupplierLedger(
                $paymentNo,
                $supplier->Code,
                $paymentAmount,
                0,
                'SUPPLIER_PAYMENT',
                $data['payment_date'],
                $user
            );

            if ((float) ($data['cheque_payment'] ?? 0) > 0) {
                $this->createSupplierCheque(
                    $paymentNo,
                    'SUPPLIER_PAYMENT',
                    $data['payment_date'],
                    (float) $data['cheque_payment'],
                    $data['cheque'] ?? [],
                    $user
                );
            }

            return $payment->load(['supplier', 'allocations.purchase', 'bankAccount']);
        });
    }

    public function supplierOutstanding(string $supplierCode, string $BC): array
    {
        $supplier = $this->findSupplier($supplierCode, $BC);
        $purchases = TPurchasesSum::query()
            ->where('supplier_code', $supplierCode)
            ->where('BC', $BC)
            ->orderBy('Invoice_date')
            ->get()
            ->map(function (TPurchasesSum $purchase) {
                $outstanding = $this->purchaseOutstanding($purchase);

                return [
                    'invoice_no' => $purchase->Invoice_no,
                    'invoice_date' => $purchase->Invoice_date?->toDateString(),
                    'reference_no' => $purchase->Ref_no,
                    'net_amount' => (float) $purchase->Net_Amount,
                    'paid_amount' => (float) $purchase->paid_amount,
                    'outstanding' => $outstanding,
                    'payment_status' => $purchase->payment_status,
                ];
            })
            ->filter(fn (array $purchase) => $purchase['outstanding'] > 0.009)
            ->values();

        return [
            'supplier' => $supplier,
            'total_outstanding' => round($purchases->sum('outstanding'), 2),
            'invoices' => $purchases,
        ];
    }

    private function prepareOrderLines(array $requestLines, Collection $items): array
    {
        $grossAmount = 0.0;
        $lines = [];

        foreach ($requestLines as $line) {
            $item = $items->get($line['item_code']);
            $qty = (int) $line['qty'];
            $unitPrice = round((float) $line['unit_price'], 2);
            $netValue = round($qty * $unitPrice, 2);
            $grossAmount += $netValue;
            $lines[] = [
                'item_code' => $item->item_code,
                'item_description' => $item->item_description,
                'qty' => $qty,
                'received_qty' => 0,
                'unit_price' => $unitPrice,
                'net_value' => $netValue,
            ];
        }

        return [round($grossAmount, 2), $lines];
    }

    private function findSupplier(string $supplierCode, string $BC): Supplier
    {
        return Supplier::query()
            ->where('Code', $supplierCode)
            ->where('BC', $BC)
            ->firstOrFail();
    }

    private function findItems(array $lines, string $BC): Collection
    {
        $itemCodes = collect($lines)->pluck('item_code')->unique()->values();
        $items = Item::query()
            ->where('BC', $BC)
            ->whereIn('item_code', $itemCodes)
            ->get()
            ->keyBy('item_code');

        if ($items->count() !== $itemCodes->count()) {
            throw ValidationException::withMessages([
                'items' => 'One or more selected items do not belong to this branch.',
            ]);
        }

        return $items;
    }

    private function purchaseOutstanding(TPurchasesSum $purchase): float
    {
        return max(
            0,
            round(
                (float) $purchase->Net_Amount - (float) $purchase->paid_amount,
                2
            )
        );
    }

    private function resolveDiscountAmount(
        float $baseAmount,
        float $discountValue,
        string $discountType,
        string $field
    ): float {
        if ($discountValue <= 0) {
            return 0.0;
        }

        if ($discountType === 'percent') {
            if ($discountValue > 100) {
                throw ValidationException::withMessages([
                    $field => 'Percentage discount cannot exceed 100%.',
                ]);
            }

            return round($baseAmount * $discountValue / 100, 2);
        }

        if ($discountValue > $baseAmount + 0.009) {
            throw ValidationException::withMessages([
                $field => 'Discount cannot exceed the applicable amount.',
            ]);
        }

        return round($discountValue, 2);
    }

    private function refreshOrderStatus(TPurchaseOrderSum $order): void
    {
        $order->load('details');
        $ordered = $order->details->sum('qty');
        $received = $order->details->sum('received_qty');
        $order->status = $received >= $ordered ? 'received' : 'partially_received';
        $order->save();
    }

    private function recordSupplierLedger(
        string $number,
        string $supplierCode,
        float $debit,
        float $credit,
        string $type,
        string $date,
        User $user
    ): void {
        TSupPurchaseTrance::create([
            'no' => $number,
            'supplier' => $supplierCode,
            'dr_trnce_code' => $debit > 0 ? $type : '',
            'dr_trnce_no' => $debit > 0 ? $number : '',
            'dr_amount' => $debit,
            'cr_trnce_code' => $credit > 0 ? $type : '',
            'cr_trnce_no' => $credit > 0 ? $number : '',
            'cr_amount' => $credit,
            'trance_type' => $type,
            'trance_no' => $number,
            'dDate' => $date,
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);
    }

    private function createSupplierCheque(
        string $transactionNumber,
        string $transactionType,
        string $transactionDate,
        float $amount,
        array $cheque,
        User $user
    ): void {
        $this->chequeEntryService->createSupplier(
            $transactionNumber,
            $transactionType,
            $transactionDate,
            $amount,
            $cheque,
            $user
        );
    }

    private function resolveBankDetailId(array $data, User $user): ?int
    {
        $nonChequeBankTotal = round(
            (float) ($data['card_payment'] ?? 0) + (float) ($data['bank_transfer'] ?? 0),
            2
        );

        if ($nonChequeBankTotal <= 0) {
            return null;
        }

        $bank = BankDetail::query()
            ->whereKey($data['bank_detail_id'] ?? null)
            ->where('BC', $user->BC)
            ->first();

        if (! $bank) {
            throw ValidationException::withMessages([
                'bank_detail_id' => 'Select the internal bank account used for card or transfer payments.',
            ]);
        }

        return (int) $bank->id;
    }

    private function nextNumber(
        string $prefix,
        string $BC,
        string $modelClass,
        string $column
    ): string {
        $date = now()->format('Ymd');
        $base = "{$prefix}-{$BC}-{$date}-";
        $sequence = $modelClass::query()
            ->where($column, 'like', $base.'%')
            ->count() + 1;

        do {
            $number = $base.str_pad((string) $sequence, 4, '0', STR_PAD_LEFT);
            $sequence++;
        } while ($modelClass::query()->where($column, $number)->exists());

        return $number;
    }
}
