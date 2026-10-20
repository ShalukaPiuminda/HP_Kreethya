<?php

namespace App\Services;

use App\Models\BankDetail;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemBatch;
use App\Models\TAdvancCusPayment;
use App\Models\TCustomerAccountTrance;
use App\Models\TCustomerAdvanceAllocation;
use App\Models\TCustomerInvoicePayment;
use App\Models\TCustomerPayment;
use App\Models\TInvoiceDeil;
use App\Models\TInvoiceSum;
use App\Models\THirePurchaseSum;
use App\Models\TSalesReturnDetail;
use App\Models\TSalesReturnSum;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SalesService
{
    public function __construct(
        private readonly StockService $stockService,
        private readonly AccountingService $accountingService,
        private readonly ChequeEntryService $chequeEntryService
    ) {}

    public function createAdvance(array $data, User $user): TAdvancCusPayment
    {
        return DB::transaction(function () use ($data, $user) {
            $customer = $this->findCustomer($data['customer_code'], $user->BC, true);
            $amount = round((float) $data['amount'], 2);
            $methodTotal = $this->paymentMethodTotal($data);
            $bankDetailId = $this->resolveBankDetailId($data, $user);

            if (abs($amount - $methodTotal) > 0.009) {
                throw ValidationException::withMessages([
                    'amount' => 'Payment methods must add up to the advance amount.',
                ]);
            }

            $paymentNo = $this->nextNumber('ADV', $user->BC, TAdvancCusPayment::class, 'payment_no');
            $advance = TAdvancCusPayment::create([
                'payment_no' => $paymentNo,
                'payment_date' => $data['payment_date'],
                'customer_nic' => $customer->NIC,
                'customer_name' => $customer->name,
                'customer_phone' => $customer->phone,
                'payment_note' => $data['payment_note'] ?? null,
                'amount' => $amount,
                'remaining_amount' => $amount,
                'cash_payment' => $data['cash_payment'] ?? 0,
                'card_payment' => $data['card_payment'] ?? 0,
                'cheque_payment' => $data['cheque_payment'] ?? 0,
                'bank_transfer' => $data['bank_transfer'] ?? 0,
                'bank_detail_id' => $bankDetailId,
                'is_carried_forward' => false,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $customer->advance_balance = round((float) $customer->advance_balance + $amount, 2);
            $customer->save();

            $this->recordCustomerLedger(
                $paymentNo,
                $customer->Code,
                0,
                $amount,
                'CUSTOMER_ADVANCE',
                $data['payment_date'],
                $user
            );

            $this->postAdvanceReceiptMethods($paymentNo, $data['payment_date'], $data, $user);

            if ((float) ($data['cheque_payment'] ?? 0) > 0) {
                $this->createCustomerCheque(
                    $paymentNo,
                    'CUSTOMER_ADVANCE',
                    $data['payment_date'],
                    (float) $data['cheque_payment'],
                    $data['cheque'] ?? [],
                    $user
                );
            }

            return $advance->load(['customer', 'allocations', 'bankAccount']);
        });
    }

    public function createInvoice(array $data, User $user): TInvoiceSum
    {
        return DB::transaction(function () use ($data, $user) {
            $customer = $this->findCustomer($data['customer_code'], $user->BC, true);
            $items = $this->findItems($data['items'], $user->BC);
            $invoiceNo = $this->nextNumber('INV', $user->BC, TInvoiceSum::class, 'Invoice_no');
            $preparedLines = [];
            $grossAmount = 0.0;
            $bankDetailId = $this->resolveBankDetailId($data, $user);

            foreach ($data['items'] as $index => $line) {
                $item = $items->get($line['item_code']);
                $qty = (int) $line['qty'];
                $batchNo = $item->is_batch ? ($line['batch_no'] ?? null) : null;

                if ($item->sales_criteria_enabled) {
                    if ($item->min_sales_qty !== null && $qty < (int) $item->min_sales_qty) {
                        throw ValidationException::withMessages([
                            "items.{$index}.qty" => "Minimum sales quantity for {$item->item_description} is {$item->min_sales_qty}.",
                        ]);
                    }

                    if ($item->max_sales_qty !== null && $qty > (int) $item->max_sales_qty) {
                        throw ValidationException::withMessages([
                            "items.{$index}.qty" => "Maximum sales quantity for {$item->item_description} is {$item->max_sales_qty}.",
                        ]);
                    }
                }

                if ($item->is_batch) {
                    $batch = ItemBatch::query()
                        ->where('batch_no', $batchNo)
                        ->where('item_code', $item->item_code)
                        ->where('store_id', $data['store_id'])
                        ->where('BC', $user->BC)
                        ->lockForUpdate()
                        ->first();

                    if (! $batch) {
                        throw ValidationException::withMessages([
                            "items.{$index}.batch_no" => 'The selected batch is not available in this store.',
                        ]);
                    }

                    $priceMode = $item->default_batch_price_mode ?: 'batch';

                    if ($priceMode === 'average') {
                        $availableBatches = ItemBatch::query()
                            ->where('item_code', $item->item_code)
                            ->where('store_id', $data['store_id'])
                            ->where('BC', $user->BC)
                            ->where('qty_in_hand', '>', 0)
                            ->lockForUpdate()
                            ->get();

                        $totalQty = (int) $availableBatches->sum('qty_in_hand');
                        $unitPrice = $totalQty > 0
                            ? round(
                                $availableBatches->sum(fn (ItemBatch $candidate) => (float) $candidate->sales_price * (int) $candidate->qty_in_hand) / $totalQty,
                                2
                            )
                            : round((float) $batch->sales_price, 2);
                    } elseif ($priceMode === 'last') {
                        $latestBatch = ItemBatch::query()
                            ->where('item_code', $item->item_code)
                            ->where('store_id', $data['store_id'])
                            ->where('BC', $user->BC)
                            ->where('qty_in_hand', '>', 0)
                            ->orderByDesc('id')
                            ->lockForUpdate()
                            ->first();

                        $unitPrice = round((float) ($latestBatch?->sales_price ?? $batch->sales_price), 2);
                    } else {
                        $unitPrice = round((float) $batch->sales_price, 2);
                    }
                } else {
                    $unitPrice = round(
                        (float) ($line['unit_price'] ?? $item->standard_sales_price),
                        2
                    );
                }

                if ($item->sales_criteria_enabled) {
                    if ($item->min_sales_price !== null && $unitPrice < (float) $item->min_sales_price) {
                        throw ValidationException::withMessages([
                            "items.{$index}.unit_price" => "Minimum sales price for {$item->item_description} is {$item->min_sales_price}.",
                        ]);
                    }

                    if ($item->max_sales_price !== null && $unitPrice > (float) $item->max_sales_price) {
                        throw ValidationException::withMessages([
                            "items.{$index}.unit_price" => "Maximum sales price for {$item->item_description} is {$item->max_sales_price}.",
                        ]);
                    }
                }

                $lineGross = round($qty * $unitPrice, 2);
                $lineDiscountType = $line['discount_type'] ?? 'amount';
                $lineDiscountValue = round((float) ($line['discount'] ?? 0), 2);
                $lineDiscount = $this->resolveDiscountAmount(
                    $lineGross,
                    $lineDiscountValue,
                    $lineDiscountType,
                    "items.{$index}.discount"
                );
                $netValue = round($lineGross - $lineDiscount, 2);

                if ($netValue < 0) {
                    throw ValidationException::withMessages([
                        "items.{$index}.discount" => 'Line discount cannot exceed the line value.',
                    ]);
                }

                $preparedLines[] = [
                    'index' => $index,
                    'item' => $item,
                    'qty' => $qty,
                    'unit_price' => $unitPrice,
                    'discount' => $lineDiscount,
                    'discount_type' => $lineDiscountType,
                    'discount_value' => $lineDiscountValue,
                    'net_value' => $netValue,
                    'batch_no' => $batchNo,
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
                    'discount' => 'Discount cannot exceed the invoice gross amount.',
                ]);
            }

            $advanceApplied = round((float) ($data['advance_amount'] ?? 0), 2);
            if ($advanceApplied > (float) $customer->advance_balance + 0.009) {
                throw ValidationException::withMessages([
                    'advance_amount' => 'Advance applied exceeds the customer advance balance.',
                ]);
            }
            if ($advanceApplied > $netAmount + 0.009) {
                throw ValidationException::withMessages([
                    'advance_amount' => 'Advance applied cannot exceed the invoice net amount.',
                ]);
            }

            $methodTotal = $this->paymentMethodTotal($data);
            $paidAmount = round($advanceApplied + $methodTotal, 2);
            if ($paidAmount > $netAmount + 0.009) {
                throw ValidationException::withMessages([
                    'cash_payment' => 'Invoice payments cannot exceed the invoice net amount.',
                ]);
            }

            $creditAmount = round($netAmount - $paidAmount, 2);
            $paymentStatus = $creditAmount <= 0.009
                ? 'paid'
                : ($paidAmount > 0 ? 'partial' : 'unpaid');

            $invoice = TInvoiceSum::create([
                'Invoice_no' => $invoiceNo,
                'reference_no' => $data['reference_no'] ?? null,
                'Invoice_date' => $data['invoice_date'],
                'customer_code' => $customer->Code,
                'store_id' => $data['store_id'],
                'salesman_id' => $data['salesman_id'] ?? null,
                'Customer_NIC' => $customer->NIC,
                'Customer_Name' => $customer->name,
                'Customer_Phone' => $customer->phone,
                'Customer_Address' => $customer->address,
                'Gross_Amount' => $grossAmount,
                'Discount' => $lineDiscounts + $headerDiscount,
                'discount_type' => $headerDiscountType,
                'discount_value' => $headerDiscountValue,
                'Net_Amount' => $netAmount,
                'Cash_Pay' => $data['cash_payment'] ?? 0,
                'card_payment' => $data['card_payment'] ?? 0,
                'Credite' => $creditAmount,
                'Cheque' => $data['cheque_payment'] ?? 0,
                'bank_transfer' => $data['bank_transfer'] ?? 0,
                'bank_detail_id' => $bankDetailId,
                'advance_applied' => $advanceApplied,
                'paid_amount' => $paidAmount,
                'payment_status' => $paymentStatus,
                'status' => 'posted',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            foreach ($preparedLines as $line) {
                TInvoiceDeil::create([
                    'Invoice_no' => $invoiceNo,
                    'Invoice_date' => $data['invoice_date'],
                    'Item_code' => $line['item']->item_code,
                    'Item_description' => $line['item']->item_description,
                    'batch_no' => $line['batch_no'],
                    'store_id' => $data['store_id'],
                    'serial_numbers' => $line['serial_numbers'],
                    'QTY' => $line['qty'],
                    'Unit_price' => $line['unit_price'],
                    'Discount' => $line['discount'],
                    'discount_type' => $line['discount_type'],
                    'discount_value' => $line['discount_value'],
                    'Net_value' => $line['net_value'],
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]);

                try {
                    $this->stockService->dispatchStock(
                        $invoiceNo,
                        'SALE',
                        $line['item']->item_code,
                        $line['batch_no'],
                        (int) $data['store_id'],
                        $line['qty'],
                        $user->BC,
                        $user->username,
                        $line['serial_numbers']
                    );
                } catch (\InvalidArgumentException|\RuntimeException $exception) {
                    throw ValidationException::withMessages([
                        "items.{$line['index']}.item_code" => $exception->getMessage(),
                    ]);
                }
            }

            $this->recordCustomerLedger(
                $invoiceNo,
                $customer->Code,
                $netAmount,
                0,
                'SALE',
                $data['invoice_date'],
                $user
            );
            $this->accountingService->postBalanced(
                'SALES_INVOICE',
                $invoiceNo,
                $data['invoice_date'],
                AccountingService::ACCOUNTS_RECEIVABLE,
                AccountingService::SALES_INCOME,
                $netAmount,
                $user
            );

            if ($advanceApplied > 0) {
                $this->allocateAdvance($customer, $invoiceNo, $advanceApplied, $user);
                $this->accountingService->postBalanced(
                    'CUSTOMER_ADVANCE_APPLIED',
                    $invoiceNo.'-ADV',
                    $data['invoice_date'],
                    AccountingService::CUSTOMER_ADVANCES,
                    AccountingService::ACCOUNTS_RECEIVABLE,
                    $advanceApplied,
                    $user
                );
                $this->recordCustomerLedger(
                    $invoiceNo.'-ADV',
                    $customer->Code,
                    0,
                    $advanceApplied,
                    'ADVANCE_APPLIED',
                    $data['invoice_date'],
                    $user
                );
            }

            if ($methodTotal > 0) {
                $this->recordCustomerLedger(
                    $invoiceNo.'-PAID',
                    $customer->Code,
                    0,
                    $methodTotal,
                    'SALE_PAYMENT',
                    $data['invoice_date'],
                    $user
                );
                $this->postReceivableReceiptMethods('SALES_INVOICE_RECEIPT', $invoiceNo, $data['invoice_date'], $data, $user);
            }

            if ((float) ($data['cheque_payment'] ?? 0) > 0) {
                $this->createCustomerCheque(
                    $invoiceNo,
                    'SALE',
                    $data['invoice_date'],
                    (float) $data['cheque_payment'],
                    $data['cheque'] ?? [],
                    $user
                );
            }

            return $invoice->load([
                'customer',
                'store',
                'salesman',
                'bankAccount',
                'details.item',
                'advanceAllocations.advance',
            ]);
        });
    }

    public function createCustomerPayment(array $data, User $user): TCustomerPayment
    {
        return DB::transaction(function () use ($data, $user) {
            $customer = $this->findCustomer($data['customer_code'], $user->BC);
            $paymentAmount = round((float) $data['payment_amount'], 2);
            $methodTotal = $this->paymentMethodTotal($data);
            $allocationTotal = round(collect($data['allocations'])->sum('amount'), 2);
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

            $paymentNo = $this->nextNumber('CP', $user->BC, TCustomerPayment::class, 'Payment_no');
            $invoices = collect();

            foreach ($data['allocations'] as $index => $allocation) {
                $invoice = TInvoiceSum::query()
                    ->where('Invoice_no', $allocation['sales_invoice_no'])
                    ->where('customer_code', $customer->Code)
                    ->where('BC', $user->BC)
                    ->whereIn('status', ['posted', 'partially_returned'])
                    ->lockForUpdate()
                    ->first();

                if (! $invoice) {
                    throw ValidationException::withMessages([
                        "allocations.{$index}.sales_invoice_no" => 'Sales invoice not found for this customer.',
                    ]);
                }

                $outstanding = $this->invoiceOutstanding($invoice);
                if ((float) $allocation['amount'] > $outstanding + 0.009) {
                    throw ValidationException::withMessages([
                        "allocations.{$index}.amount" => "Only {$outstanding} remains outstanding on {$invoice->Invoice_no}.",
                    ]);
                }

                $invoices->put($invoice->Invoice_no, $invoice);
            }

            $payment = TCustomerPayment::create([
                'Payment_no' => $paymentNo,
                'Payment_date' => $data['payment_date'],
                'Customer_NIC' => $customer->NIC,
                'Customer_Name' => $customer->name,
                'Customer_Phone' => $customer->phone,
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
                TCustomerInvoicePayment::create([
                    'payment_no' => $paymentNo,
                    'sales_invoice_no' => $allocation['sales_invoice_no'],
                    'amount_allocated' => $allocation['amount'],
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]);

                $invoice = $invoices->get($allocation['sales_invoice_no']);
                $invoice->paid_amount = round(
                    (float) $invoice->paid_amount + (float) $allocation['amount'],
                    2
                );
                $outstandingAfter = $this->invoiceOutstanding($invoice);
                $invoice->Credite = $outstandingAfter;
                $invoice->payment_status = $outstandingAfter <= 0.009 ? 'paid' : 'partial';
                $invoice->save();
            }

            $this->recordCustomerLedger(
                $paymentNo,
                $customer->Code,
                0,
                $paymentAmount,
                'CUSTOMER_PAYMENT',
                $data['payment_date'],
                $user
            );
            $this->postReceivableReceiptMethods('CUSTOMER_PAYMENT_RECEIPT', $paymentNo, $data['payment_date'], $data, $user);

            if ((float) ($data['cheque_payment'] ?? 0) > 0) {
                $this->createCustomerCheque(
                    $paymentNo,
                    'CUSTOMER_PAYMENT',
                    $data['payment_date'],
                    (float) $data['cheque_payment'],
                    $data['cheque'] ?? [],
                    $user
                );
            }

            return $payment->load(['customer', 'allocations.invoice', 'bankAccount']);
        });
    }

    public function customerOutstanding(string $customerCode, string $BC): array
    {
        $customer = $this->findCustomer($customerCode, $BC);
        $invoices = TInvoiceSum::query()
            ->where('customer_code', $customerCode)
            ->where('BC', $BC)
            ->whereIn('status', ['posted', 'partially_returned'])
            ->orderBy('Invoice_date')
            ->get()
            ->map(function (TInvoiceSum $invoice) {
                return [
                    'invoice_no' => $invoice->Invoice_no,
                    'invoice_date' => $invoice->Invoice_date?->toDateString(),
                    'reference_no' => $invoice->reference_no,
                    'net_amount' => (float) $invoice->Net_Amount,
                    'paid_amount' => (float) $invoice->paid_amount,
                    'outstanding' => $this->invoiceOutstanding($invoice),
                    'payment_status' => $invoice->payment_status,
                ];
            })
            ->filter(fn (array $invoice) => $invoice['outstanding'] > 0.009)
            ->values();
        $hpAgreements = THirePurchaseSum::query()
            ->where('customer_code', $customerCode)
            ->where('BC', $BC)
            ->whereIn('status', ['active', 'completed'])
            ->orderBy('invoice_date')
            ->get()
            ->map(function (THirePurchaseSum $agreement) {
                $outstanding = round(
                    (float) $agreement->outstanding_amount
                    + (float) $agreement->down_payment_outstanding,
                    2
                );

                return [
                    'invoice_no' => $agreement->invoice_no,
                    'agreement_no' => $agreement->agreement_no,
                    'invoice_date' => $agreement->invoice_date?->toDateString(),
                    'contract_amount' => (float) $agreement->contract_amount,
                    'paid_amount' => (float) $agreement->paid_amount,
                    'down_payment_outstanding' => (float) $agreement->down_payment_outstanding,
                    'outstanding' => $outstanding,
                    'status' => $agreement->status,
                ];
            })
            ->filter(fn (array $agreement) => $agreement['outstanding'] > 0.009)
            ->values();
        $salesOutstanding = round($invoices->sum('outstanding'), 2);
        $hpOutstanding = round($hpAgreements->sum('outstanding'), 2);

        return [
            'customer' => $customer,
            'advance_balance' => (float) $customer->advance_balance,
            'total_outstanding' => $salesOutstanding,
            'sales_outstanding' => $salesOutstanding,
            'hp_outstanding' => $hpOutstanding,
            'total_account_outstanding' => round($salesOutstanding + $hpOutstanding, 2),
            'net_balance' => round($salesOutstanding + $hpOutstanding - (float) $customer->advance_balance, 2),
            'invoices' => $invoices,
            'hp_agreements' => $hpAgreements,
        ];
    }

    public function createReturn(array $data, User $user): TSalesReturnSum
    {
        return DB::transaction(function () use ($data, $user) {
            $invoice = TInvoiceSum::query()
                ->where('Invoice_no', $data['invoice_no'])
                ->where('BC', $user->BC)
                ->where('status', '!=', 'returned')
                ->with(['customer', 'details.item'])
                ->lockForUpdate()
                ->firstOrFail();

            $returnNo = $this->nextNumber('SR', $user->BC, TSalesReturnSum::class, 'return_no');
            $preparedLines = [];
            $returnTotal = 0.0;

            foreach ($data['items'] as $index => $line) {
                $detail = $invoice->details->firstWhere('id', (int) $line['invoice_detail_id']);
                if (! $detail) {
                    throw ValidationException::withMessages([
                        "items.{$index}.invoice_detail_id" => 'The selected line does not belong to this invoice.',
                    ]);
                }

                $alreadyReturned = (int) TSalesReturnDetail::query()
                    ->where('invoice_detail_id', $detail->id)
                    ->sum('qty');
                $returnable = (int) $detail->QTY - $alreadyReturned;
                $qty = (int) $line['qty'];

                if ($qty > $returnable) {
                    throw ValidationException::withMessages([
                        "items.{$index}.qty" => "Only {$returnable} units remain returnable.",
                    ]);
                }

                $serialNumbers = $line['serial_numbers'] ?? [];
                if ($detail->item?->is_serialized) {
                    $soldSerials = collect($detail->serial_numbers ?? []);
                    if (collect($serialNumbers)->diff($soldSerials)->isNotEmpty()) {
                        throw ValidationException::withMessages([
                            "items.{$index}.serial_numbers" => 'Returned serial numbers must belong to the original sale.',
                        ]);
                    }
                }

                $netUnit = round((float) $detail->Net_value / max(1, (int) $detail->QTY), 2);
                $netValue = round($netUnit * $qty, 2);
                $preparedLines[] = [
                    'index' => $index,
                    'detail' => $detail,
                    'qty' => $qty,
                    'unit_price' => $netUnit,
                    'net_value' => $netValue,
                    'serial_numbers' => $serialNumbers,
                ];
                $returnTotal += $netValue;
            }

            $outstandingBefore = $this->invoiceOutstanding($invoice);
            $creditAdjustment = min($returnTotal, $outstandingBefore);
            $refundAmount = round($returnTotal - $creditAdjustment, 2);

            $return = TSalesReturnSum::create([
                'return_no' => $returnNo,
                'return_date' => $data['return_date'],
                'invoice_no' => $invoice->Invoice_no,
                'customer_nic' => $invoice->Customer_NIC,
                'reason_id' => $data['reason_id'],
                'store_id' => $invoice->store_id,
                'gross_amount' => $returnTotal,
                'net_amount' => $returnTotal,
                'credit_adjustment' => $creditAdjustment,
                'refund_amount' => $refundAmount,
                'refund_method' => $data['refund_method'] ?? 'cash',
                'status' => 'posted',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            foreach ($preparedLines as $line) {
                $detail = $line['detail'];
                TSalesReturnDetail::create([
                    'return_no' => $returnNo,
                    'invoice_detail_id' => $detail->id,
                    'item_code' => $detail->Item_code,
                    'batch_no' => $detail->batch_no,
                    'store_id' => $detail->store_id,
                    'serial_numbers' => $line['serial_numbers'],
                    'qty' => $line['qty'],
                    'unit_price' => $line['unit_price'],
                    'net_value' => $line['net_value'],
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]);

                $item = $detail->item;
                $purchasePrice = (float) $item->standard_purchase_price;
                $salesPrice = (float) $item->standard_sales_price;
                if ($item->is_batch) {
                    $batch = ItemBatch::query()
                        ->where('batch_no', $detail->batch_no)
                        ->where('item_code', $detail->Item_code)
                        ->where('store_id', $detail->store_id)
                        ->where('BC', $user->BC)
                        ->firstOrFail();
                    $purchasePrice = (float) $batch->purchase_price;
                    $salesPrice = (float) $batch->sales_price;
                }

                try {
                    $this->stockService->receiveStock(
                        $returnNo,
                        'SALE-RETURN',
                        $detail->Item_code,
                        $detail->batch_no,
                        (int) $detail->store_id,
                        $line['qty'],
                        $purchasePrice,
                        $salesPrice,
                        $user->BC,
                        $user->username,
                        $line['serial_numbers']
                    );
                } catch (\InvalidArgumentException|\RuntimeException $exception) {
                    throw ValidationException::withMessages([
                        "items.{$line['index']}.invoice_detail_id" => $exception->getMessage(),
                    ]);
                }
            }

            $invoice->returned_amount = round((float) $invoice->returned_amount + $returnTotal, 2);
            $invoice->Credite = $this->invoiceOutstanding($invoice);
            $invoice->payment_status = $invoice->Credite <= 0.009 ? 'paid' : 'partial';
            $invoice->status = $invoice->returned_amount >= (float) $invoice->Net_Amount - 0.009
                ? 'returned'
                : 'partially_returned';
            $invoice->save();

            $this->recordCustomerLedger(
                $returnNo,
                $invoice->customer_code,
                0,
                $returnTotal,
                'SALE_RETURN',
                $data['return_date'],
                $user
            );

            if ($refundAmount > 0) {
                $refundType = 'SALE_RETURN_REFUND';

                if (($data['refund_method'] ?? 'cash') === 'store_credit') {
                    $customer = $this->findCustomer($invoice->customer_code, $user->BC, true);
                    $advanceNo = $this->nextNumber(
                        'ADV',
                        $user->BC,
                        TAdvancCusPayment::class,
                        'payment_no'
                    );
                    TAdvancCusPayment::create([
                        'payment_no' => $advanceNo,
                        'payment_date' => $data['return_date'],
                        'customer_nic' => $customer->NIC,
                        'customer_name' => $customer->name,
                        'customer_phone' => $customer->phone,
                        'payment_note' => "Store credit from sales return {$returnNo}",
                        'amount' => $refundAmount,
                        'remaining_amount' => $refundAmount,
                        'cash_payment' => 0,
                        'card_payment' => 0,
                        'cheque_payment' => 0,
                        'bank_transfer' => 0,
                        'is_carried_forward' => false,
                        'BC' => $user->BC,
                        'UID' => $user->username,
                    ]);
                    $customer->advance_balance = round(
                        (float) $customer->advance_balance + $refundAmount,
                        2
                    );
                    $customer->save();
                    $refundType = 'SALE_RETURN_STORE_CREDIT';
                }

                $this->recordCustomerLedger(
                    $returnNo.'-REFUND',
                    $invoice->customer_code,
                    $refundAmount,
                    0,
                    $refundType,
                    $data['return_date'],
                    $user
                );
            }

            return $return->load(['invoice.customer', 'reason', 'store', 'details.item']);
        });
    }

    private function allocateAdvance(
        Customer $customer,
        string $invoiceNo,
        float $amount,
        User $user
    ): void {
        $remaining = $amount;
        $advances = TAdvancCusPayment::query()
            ->where('customer_nic', $customer->NIC)
            ->where('BC', $user->BC)
            ->where('remaining_amount', '>', 0)
            ->orderBy('payment_date')
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        if ((float) $advances->sum('remaining_amount') + 0.009 < $amount) {
            throw ValidationException::withMessages([
                'advance_amount' => 'The customer advance records do not cover the requested amount.',
            ]);
        }

        foreach ($advances as $advance) {
            if ($remaining <= 0.009) {
                break;
            }

            $allocated = min($remaining, (float) $advance->remaining_amount);
            TCustomerAdvanceAllocation::create([
                'advance_payment_no' => $advance->payment_no,
                'sales_invoice_no' => $invoiceNo,
                'amount_allocated' => $allocated,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $advance->remaining_amount = round((float) $advance->remaining_amount - $allocated, 2);
            $advance->is_carried_forward = $advance->remaining_amount <= 0.009;
            $advance->carried_forward_invoice_no = $invoiceNo;
            $advance->save();
            $remaining = round($remaining - $allocated, 2);
        }

        $customer->advance_balance = round((float) $customer->advance_balance - $amount, 2);
        $customer->save();
    }

    private function findCustomer(string $customerCode, string $BC, bool $lock = false): Customer
    {
        return Customer::query()
            ->where('Code', $customerCode)
            ->where('BC', $BC)
            ->when($lock, fn ($query) => $query->lockForUpdate())
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

    private function paymentMethodTotal(array $data): float
    {
        return round(
            (float) ($data['cash_payment'] ?? 0)
            + (float) ($data['card_payment'] ?? 0)
            + (float) ($data['cheque_payment'] ?? 0)
            + (float) ($data['bank_transfer'] ?? 0),
            2
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
                'bank_detail_id' => 'Select the internal bank account used for card or transfer receipts.',
            ]);
        }

        return (int) $bank->id;
    }

    private function invoiceOutstanding(TInvoiceSum $invoice): float
    {
        return max(
            0,
            round(
                (float) $invoice->Net_Amount
                - (float) $invoice->returned_amount
                - (float) $invoice->paid_amount,
                2
            )
        );
    }

    private function recordCustomerLedger(
        string $number,
        string $customerCode,
        float $debit,
        float $credit,
        string $type,
        string $date,
        User $user
    ): void {
        TCustomerAccountTrance::create([
            'no' => $number,
            'customer_code' => $customerCode,
            'dr_amount' => $debit,
            'cr_amount' => $credit,
            'trance_type' => $type,
            'trance_no' => $number,
            'dDate' => $date,
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);
    }

    private function createCustomerCheque(
        string $transactionNumber,
        string $transactionType,
        string $transactionDate,
        float $amount,
        array $cheque,
        User $user
    ): void {
        $this->chequeEntryService->createCustomer(
            $transactionNumber,
            $transactionType,
            $transactionDate,
            $amount,
            $cheque,
            $user,
            $transactionType === 'CUSTOMER_ADVANCE'
                ? AccountingService::CUSTOMER_ADVANCES
                : AccountingService::ACCOUNTS_RECEIVABLE
        );
    }

    private function postAdvanceReceiptMethods(
        string $paymentNo,
        string $date,
        array $data,
        User $user
    ): void {
        foreach ([
            'cash_payment' => AccountingService::CASH,
            'card_payment' => AccountingService::BANK,
            'bank_transfer' => AccountingService::BANK,
        ] as $field => $account) {
            $amount = round((float) ($data[$field] ?? 0), 2);
            if ($amount <= 0) {
                continue;
            }

            $this->accountingService->postBalanced(
                'CUSTOMER_ADVANCE_RECEIPT',
                $paymentNo.'-'.strtoupper($field),
                $date,
                $account,
                AccountingService::CUSTOMER_ADVANCES,
                $amount,
                $user
            );
        }
    }

    private function postReceivableReceiptMethods(
        string $type,
        string $number,
        string $date,
        array $data,
        User $user
    ): void {
        foreach ([
            'cash_payment' => AccountingService::CASH,
            'card_payment' => AccountingService::BANK,
            'bank_transfer' => AccountingService::BANK,
        ] as $field => $account) {
            $amount = round((float) ($data[$field] ?? 0), 2);
            if ($amount <= 0) {
                continue;
            }

            $this->accountingService->postBalanced(
                $type,
                $number.'-'.strtoupper($field),
                $date,
                $account,
                AccountingService::ACCOUNTS_RECEIVABLE,
                $amount,
                $user
            );
        }
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
