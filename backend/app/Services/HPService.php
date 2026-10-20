<?php

namespace App\Services;

use App\Models\BankDetail;
use App\Models\Customer;
use App\Models\HpStatusHistory;
use App\Models\Item;
use App\Models\ItemBatch;
use App\Models\MGuarantor;
use App\Models\MSchema;
use App\Models\Store;
use App\Models\TAdvancCusPayment;
use App\Models\TCustomerAccountTrance;
use App\Models\TCustomerHpAdvanceAllocation;
use App\Models\THirePurchaseDetail;
use App\Models\THirePurchaseReturnDetail;
use App\Models\THirePurchaseReturnSum;
use App\Models\THirePurchaseSum;
use App\Models\THirePurchaseToSale;
use App\Models\THpInstallmentPayment;
use App\Models\TInstalment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class HPService
{
    public function __construct(
        private readonly StockService $stockService,
        private readonly AccountingService $accountingService,
        private readonly ChequeEntryService $chequeEntryService
    ) {}

    public function calculate(array $data, string $branchCode): array
    {
        $schema = MSchema::query()
            ->where('SchemaType', $data['schema_type'])
            ->where('BC', $branchCode)
            ->firstOrFail();

        $netAmount = round((float) $data['net_amount'], 2);
        $downPayment = round((float) $data['down_payment'], 2);
        if ($downPayment > $netAmount) {
            throw ValidationException::withMessages([
                'down_payment' => 'Down payment cannot exceed the item net amount.',
            ]);
        }

        $principal = round($netAmount - $downPayment, 2);
        $interestAmount = round($principal * ((float) $schema->InstallmentRate / 100), 2);
        $documentCharge = round($principal * ((float) $schema->DocumentCharagePrecentage / 100), 2);
        $transport = round((float) ($data['transport'] ?? 0), 2);
        $grossHpAmount = round($principal + $interestAmount + $documentCharge + $transport, 2);
        $contractAmount = round($downPayment + $grossHpAmount, 2);
        $installmentMonthly = round($grossHpAmount / max(1, (int) $schema->NoOfInstallment), 2);

        return [
            'principal' => $principal,
            'interest_amount' => $interestAmount,
            'document_charge' => $documentCharge,
            'transport' => $transport,
            'gross_hp_amount' => $grossHpAmount,
            'contract_amount' => $contractAmount,
            'installment_monthly' => $installmentMonthly,
            'no_of_installments' => (int) $schema->NoOfInstallment,
            'recommended_down_payment' => round(
                $netAmount * ((float) $schema->DownpaymentPrecentage / 100),
                2
            ),
            'penalty_rate' => (float) $schema->PanaltyCharage,
            'grace_period_days' => (int) $schema->GracePeriodDays,
            'schema' => $schema,
        ];
    }

    public function createAgreement(array $data, User $user): THirePurchaseSum
    {
        return DB::transaction(function () use ($data, $user) {
            $customer = Customer::query()
                ->where('Code', $data['customer_code'])
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->firstOrFail();
            $store = Store::query()
                ->whereKey($data['store_id'])
                ->where('BC', $user->BC)
                ->firstOrFail();
            $items = Item::query()
                ->where('BC', $user->BC)
                ->whereIn('item_code', collect($data['items'])->pluck('item_code'))
                ->get()
                ->keyBy('item_code');

            $preparedLines = $this->prepareLines($data['items'], $items, $store, $user);
            $grossAmount = round(collect($preparedLines)->sum('gross_value'), 2);
            $lineDiscount = round(collect($preparedLines)->sum('discount'), 2);
            $headerDiscountType = $data['discount_type'] ?? 'amount';
            $headerDiscountValue = round((float) ($data['discount'] ?? 0), 2);
            $headerDiscount = $this->resolveDiscountAmount(
                round($grossAmount - $lineDiscount, 2),
                $headerDiscountValue,
                $headerDiscountType,
                'discount'
            );
            $netAmount = round($grossAmount - $lineDiscount - $headerDiscount, 2);
            if ($netAmount <= 0) {
                throw ValidationException::withMessages([
                    'discount' => 'The agreement net amount must be greater than zero.',
                ]);
            }

            $calc = $this->calculate([
                'schema_type' => $data['schema_type'],
                'net_amount' => $netAmount,
                'down_payment' => $data['down_payment'],
                'transport' => $data['transport'] ?? 0,
            ], $user->BC);
            $advanceApplied = round((float) ($data['advance_amount'] ?? 0), 2);
            $downPayment = round((float) $data['down_payment'], 2);
            if ($advanceApplied > (float) $customer->advance_balance + 0.009) {
                throw ValidationException::withMessages([
                    'advance_amount' => 'Advance applied exceeds the customer advance balance.',
                ]);
            }
            if ($advanceApplied > $downPayment + 0.009) {
                throw ValidationException::withMessages([
                    'advance_amount' => 'Advance applied cannot exceed the down payment.',
                ]);
            }
            $tenderAmount = round($downPayment - $advanceApplied, 2);
            $this->validatePaymentMethod(
                $tenderAmount,
                $data['down_payment_method'] ?? 'cash',
                $data,
                $user
            );

            $invoiceNo = $this->nextNumber('HP', $user->BC, THirePurchaseSum::class, 'invoice_no');
            $agreementNo = $this->nextNumber('AGR', $user->BC, THirePurchaseSum::class, 'agreement_no');
            $schema = $calc['schema'];

            $agreement = THirePurchaseSum::create([
                'invoice_no' => $invoiceNo,
                'reference_no' => $data['reference_no'] ?? null,
                'agreement_no' => $agreementNo,
                'invoice_date' => $data['invoice_date'],
                'customer_code' => $customer->Code,
                'customer_name' => $customer->name,
                'customer_nic' => $customer->NIC,
                'customer_phone' => $customer->phone,
                'customer_address' => $customer->address,
                'guarantor_1_code' => $data['guarantor_1_code'] ?? null,
                'guarantor_2_code' => $data['guarantor_2_code'] ?? null,
                'schema_type' => $schema->SchemaType,
                'store_id' => $store->id,
                'document_charge_rate' => $schema->DocumentCharagePrecentage,
                'document_charge' => $calc['document_charge'],
                'down_payment_rate' => $schema->DownpaymentPrecentage,
                'down_payment' => $downPayment,
                'advance_applied' => $advanceApplied,
                'down_payment_outstanding' => 0,
                'transport' => $calc['transport'],
                'instalment_rate' => $schema->InstallmentRate,
                'instalment_amount' => $calc['interest_amount'],
                'no_of_instalment' => $schema->NoOfInstallment,
                'instalment_due_date' => $data['instalment_due_date'] ?? 1,
                'instalment' => $calc['installment_monthly'],
                'due_amount' => $calc['gross_hp_amount'],
                'gross_amount' => $grossAmount,
                'discount' => $lineDiscount + $headerDiscount,
                'discount_type' => $headerDiscountType,
                'discount_value' => $headerDiscountValue,
                'net_amount' => $netAmount,
                'contract_amount' => $calc['contract_amount'],
                'paid_amount' => $downPayment,
                'outstanding_amount' => $calc['gross_hp_amount'],
                'returned_amount' => 0,
                'is_cash_converted' => false,
                'status' => 'active',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            foreach ($preparedLines as $line) {
                THirePurchaseDetail::create([
                    'invoice_no' => $invoiceNo,
                    'invoice_date' => $data['invoice_date'],
                    'item_code' => $line['item']->item_code,
                    'Item_s_code' => null,
                    'item_description' => $line['item']->item_description,
                    'batch_no' => $line['batch_no'],
                    'store_id' => $store->id,
                    'serial_numbers' => $line['serial_numbers'],
                    'qty' => $line['qty'],
                    'returned_qty' => 0,
                    'unit_price' => $line['unit_price'],
                    'discount_precentage' => 0,
                    'discount' => $line['discount'],
                    'discount_type' => $line['discount_type'],
                    'discount_value' => $line['discount_value'],
                    'net_value' => $line['net_value'],
                    'is_cash_converted' => false,
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]);

                try {
                    $this->stockService->dispatchStock(
                        $invoiceNo,
                        'HP-SALE',
                        $line['item']->item_code,
                        $line['batch_no'],
                        $store->id,
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

            $this->createSchedule($agreement, $calc, $user);
            $this->postAgreementJournal($agreement, $calc, $user);
            $this->recordCustomerLedger(
                $invoiceNo,
                $customer->Code,
                $calc['contract_amount'],
                0,
                'HP_AGREEMENT',
                $data['invoice_date'],
                $user
            );
            if ($advanceApplied > 0) {
                $this->allocateAdvance($customer, $invoiceNo, $advanceApplied, $user);
                $this->accountingService->postBalanced(
                    'CUSTOMER_ADVANCE_APPLIED_HP',
                    $invoiceNo.'-ADV',
                    $data['invoice_date'],
                    AccountingService::CUSTOMER_ADVANCES,
                    AccountingService::HP_RECEIVABLE,
                    $advanceApplied,
                    $user
                );
            }
            if ($downPayment > 0) {
                $this->recordCustomerLedger(
                    $invoiceNo.'-DP',
                    $customer->Code,
                    0,
                    $downPayment,
                    'HP_DOWN_PAYMENT',
                    $data['invoice_date'],
                    $user
                );
            }
            $this->postReceipt(
                'HP_DOWN_PAYMENT',
                $invoiceNo.'-DP',
                $data['invoice_date'],
                $tenderAmount,
                $data['down_payment_method'] ?? 'cash',
                AccountingService::HP_RECEIVABLE,
                $user
            );

            if (($data['down_payment_method'] ?? 'cash') === 'cheque' && $tenderAmount > 0) {
                $this->createCustomerCheque(
                    $invoiceNo.'-DP',
                    'HP_DOWN_PAYMENT',
                    $data['invoice_date'],
                    $tenderAmount,
                    $data['cheque'] ?? [],
                    $user
                );
            }

            $this->recordHistory(
                $agreement,
                'agreement_created',
                null,
                'active',
                "Agreement created with {$schema->NoOfInstallment} installments.",
                $data['invoice_date'],
                $user
            );

            return $this->loadAgreement($agreement->id, $user->BC);
        });
    }

    public function createOpeningAgreement(array $data, User $user): THirePurchaseSum
    {
        return DB::transaction(function () use ($data, $user) {
            $customer = Customer::query()
                ->where('Code', $data['customer_code'])
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->firstOrFail();
            $store = Store::query()
                ->whereKey($data['store_id'])
                ->where('BC', $user->BC)
                ->firstOrFail();
            $schema = MSchema::query()
                ->where('SchemaType', $data['schema_type'])
                ->where('BC', $user->BC)
                ->firstOrFail();
            $items = Item::query()
                ->where('BC', $user->BC)
                ->whereIn('item_code', collect($data['items'])->pluck('item_code'))
                ->get()
                ->keyBy('item_code');

            $preparedLines = [];
            foreach ($data['items'] as $index => $line) {
                $item = $items->get($line['item_code']);
                if (! $item) {
                    throw ValidationException::withMessages(["items.{$index}.item_code" => 'Item is not available in this branch.']);
                }

                $qty = (int) $line['qty'];
                $unitPrice = round((float) ($line['unit_price'] ?? $item->standard_sales_price ?? 0), 2);
                $netValue = round((float) ($line['net_value'] ?? ($unitPrice * $qty)), 2);
                if ($unitPrice <= 0 || $netValue <= 0) {
                    throw ValidationException::withMessages(["items.{$index}.unit_price" => 'Opening item price and value must be greater than zero.']);
                }

                $preparedLines[] = [
                    'item' => $item,
                    'qty' => $qty,
                    'batch_no' => $line['batch_no'] ?? null,
                    'serial_numbers' => $line['serial_numbers'] ?? [],
                    'unit_price' => $unitPrice,
                    'discount' => 0,
                    'net_value' => $netValue,
                ];
            }

            $installments = collect($data['installments'])
                ->map(function (array $row, int $index) {
                    $baseAmount = round((float) $row['base_amount'], 2);
                    $paidAmount = round((float) ($row['amount_pay'] ?? 0), 2);
                    $balanceAmount = round((float) ($row['balance_amount'] ?? max(0, $baseAmount - $paidAmount)), 2);
                    if (abs($baseAmount - $paidAmount - $balanceAmount) > 0.009) {
                        throw ValidationException::withMessages([
                            "installments.{$index}.balance_amount" => 'Installment paid plus balance must equal the installment amount.',
                        ]);
                    }

                    return [
                        'instalment_no' => (int) $row['instalment_no'],
                        'instalment_date' => $row['instalment_date'],
                        'base_amount' => $baseAmount,
                        'amount_pay' => $paidAmount,
                        'balance_amount' => $balanceAmount,
                        'status' => $balanceAmount <= 0.009 ? 'paid' : ($paidAmount > 0 ? 'partial' : 'pending'),
                    ];
                })
                ->sortBy('instalment_no')
                ->values();

            $grossAmount = round(collect($preparedLines)->sum('net_value'), 2);
            $contractAmount = round($installments->sum('base_amount'), 2);
            $paidAmount = round($installments->sum('amount_pay'), 2);
            $outstandingAmount = round($installments->sum('balance_amount'), 2);
            if ($contractAmount <= 0 || $outstandingAmount <= 0) {
                throw ValidationException::withMessages(['installments' => 'Opening agreement must have an outstanding installment balance.']);
            }

            $invoiceNo = $this->nextNumber('OHP', $user->BC, THirePurchaseSum::class, 'invoice_no');
            $agreementNo = $this->nextNumber('AGR', $user->BC, THirePurchaseSum::class, 'agreement_no');

            $agreement = THirePurchaseSum::create([
                'invoice_no' => $invoiceNo,
                'reference_no' => $data['reference_no'] ?? null,
                'opening_reference_no' => $data['opening_reference_no'] ?? null,
                'opening_note' => $data['opening_note'] ?? null,
                'agreement_no' => $agreementNo,
                'invoice_date' => $data['invoice_date'],
                'customer_code' => $customer->Code,
                'customer_name' => $customer->name,
                'customer_nic' => $customer->NIC,
                'customer_phone' => $customer->phone,
                'customer_address' => $customer->address,
                'guarantor_1_code' => $data['guarantor_1_code'] ?? null,
                'guarantor_2_code' => $data['guarantor_2_code'] ?? null,
                'schema_type' => $schema->SchemaType,
                'store_id' => $store->id,
                'document_charge_rate' => 0,
                'document_charge' => 0,
                'down_payment_rate' => 0,
                'down_payment' => 0,
                'advance_applied' => 0,
                'down_payment_outstanding' => 0,
                'transport' => 0,
                'instalment_rate' => $schema->InstallmentRate,
                'instalment_amount' => 0,
                'no_of_instalment' => $installments->count(),
                'instalment_due_date' => (int) Carbon::parse($installments->first()['instalment_date'])->day,
                'instalment' => round($contractAmount / max(1, $installments->count()), 2),
                'due_amount' => $contractAmount,
                'gross_amount' => $grossAmount,
                'discount' => 0,
                'discount_type' => 'amount',
                'discount_value' => 0,
                'net_amount' => $grossAmount,
                'contract_amount' => $contractAmount,
                'paid_amount' => $paidAmount,
                'outstanding_amount' => $outstandingAmount,
                'returned_amount' => 0,
                'is_cash_converted' => false,
                'is_opening' => true,
                'status' => 'active',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            foreach ($preparedLines as $line) {
                THirePurchaseDetail::create([
                    'invoice_no' => $invoiceNo,
                    'invoice_date' => $data['invoice_date'],
                    'item_code' => $line['item']->item_code,
                    'Item_s_code' => null,
                    'item_description' => $line['item']->item_description,
                    'batch_no' => $line['batch_no'],
                    'store_id' => $store->id,
                    'serial_numbers' => $line['serial_numbers'],
                    'qty' => $line['qty'],
                    'returned_qty' => 0,
                    'unit_price' => $line['unit_price'],
                    'discount_precentage' => 0,
                    'discount' => 0,
                    'discount_type' => 'amount',
                    'discount_value' => 0,
                    'net_value' => $line['net_value'],
                    'is_cash_converted' => false,
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]);
            }

            foreach ($installments as $installment) {
                TInstalment::create([
                    'invoice_no' => $agreement->invoice_no,
                    'agreement_no' => $agreement->agreement_no,
                    'invoice_date' => $agreement->invoice_date,
                    'customer_code' => $agreement->customer_code,
                    'customer_name' => $agreement->customer_name,
                    'instalment_no' => $installment['instalment_no'],
                    'instalment_date' => $installment['instalment_date'],
                    'instalment_amount' => $installment['base_amount'],
                    'base_amount' => $installment['base_amount'],
                    'instalment' => $installment['base_amount'],
                    'amount_pay' => $installment['amount_pay'],
                    'balance_amount' => $installment['balance_amount'],
                    'status' => $installment['status'],
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]);
            }

            $this->accountingService->postBalanced(
                'HP_OPENING',
                $invoiceNo,
                $data['invoice_date'],
                AccountingService::HP_RECEIVABLE,
                AccountingService::OPENING_BALANCE_EQUITY,
                $outstandingAmount,
                $user
            );
            $this->recordCustomerLedger(
                $invoiceNo,
                $customer->Code,
                $outstandingAmount,
                0,
                'HP_OPENING',
                $data['invoice_date'],
                $user
            );
            $this->recordHistory(
                $agreement,
                'opening_agreement_created',
                null,
                'active',
                "Opening hire purchase imported with {$installments->count()} installment rows.",
                $data['invoice_date'],
                $user
            );

            return $this->loadAgreement($agreement->id, $user->BC);
        });
    }

    public function calculatePenalty(
        float $principalBalance,
        string $instalmentDate,
        float $penaltyRate,
        int $graceDays = 5,
        ?string $asOfDate = null
    ): array {
        $principalBalance = round(max(0, $principalBalance), 2);
        $asOf = $asOfDate ? Carbon::parse($asOfDate)->startOfDay() : Carbon::today();
        $dueDate = Carbon::parse($instalmentDate)->startOfDay();
        $graceDeadline = $dueDate->copy()->addDays($graceDays);

        if ($principalBalance <= 0 || $asOf->lte($graceDeadline)) {
            return [
                'penalty_amount' => 0.0,
                'penalty_total_amount' => $principalBalance,
                'months_overdue' => 0,
            ];
        }

        $monthsOverdue = max(1, $dueDate->diffInMonths($asOf));
        $running = $principalBalance * pow(1 + ($penaltyRate / 100), $monthsOverdue);
        $penalty = round($running - $principalBalance, 2);

        return [
            'penalty_amount' => $penalty,
            'penalty_total_amount' => round($principalBalance + $penalty, 2),
            'months_overdue' => $monthsOverdue,
        ];
    }

    public function payInstallment(int $instalmentId, array $data, User $user): THirePurchaseSum
    {
        return DB::transaction(function () use ($instalmentId, $data, $user) {
            $first = TInstalment::query()
                ->whereKey($instalmentId)
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->firstOrFail();
            $agreement = THirePurchaseSum::query()
                ->where('invoice_no', $first->invoice_no)
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->firstOrFail();

            if ($agreement->status !== 'active') {
                throw ValidationException::withMessages([
                    'instalment' => 'Only active agreements can receive installment payments.',
                ]);
            }

            $amount = round((float) $data['amount'], 2);
            $discount = round((float) ($data['discount'] ?? 0), 2);
            $this->validatePaymentMethod($amount, $data['payment_method'], $data, $user);
            if ($amount <= 0 && $discount <= 0) {
                throw ValidationException::withMessages(['amount' => 'Payment or discount must be greater than zero.']);
            }

            $targets = TInstalment::query()
                ->where('invoice_no', $agreement->invoice_no)
                ->where('id', '>=', $first->id)
                ->whereIn('status', ['pending', 'partial'])
                ->orderBy('instalment_no')
                ->lockForUpdate()
                ->get();
            $remaining = $amount;
            $remainingDiscount = $discount;
            $paymentNumbers = [];
            $collectionNo = $this->nextNumber('HPCOL', $user->BC, THpInstallmentPayment::class, 'collection_no');

            foreach ($targets as $target) {
                if ($remaining <= 0.009 && $remainingDiscount <= 0.009) {
                    break;
                }

                $penalty = ($data['waive_penalty'] ?? false)
                    ? ['penalty_amount' => 0.0, 'penalty_total_amount' => (float) $target->balance_amount]
                    : $this->calculatePenalty(
                        (float) $target->balance_amount,
                        $target->instalment_date->format('Y-m-d'),
                        (float) $agreement->schema->PanaltyCharage,
                        (int) $agreement->schema->GracePeriodDays,
                        $data['payment_date']
                    );

                $penaltyApplied = min($remaining, (float) $penalty['penalty_amount']);
                $remaining -= $penaltyApplied;
                $principalApplied = min($remaining, (float) $target->balance_amount);
                $remaining -= $principalApplied;
                $discountApplied = min($remainingDiscount, max(0, (float) $target->balance_amount - $principalApplied));
                $remainingDiscount -= $discountApplied;

                if ($penaltyApplied + $principalApplied + $discountApplied <= 0.009) {
                    continue;
                }

                $paymentNo = $this->nextNumber('HPP', $user->BC, THpInstallmentPayment::class, 'payment_no');
                $paymentNumbers[] = $paymentNo;
                THpInstallmentPayment::create([
                    'payment_no' => $paymentNo,
                    'collection_no' => $collectionNo,
                    'instalment_id' => $target->id,
                    'invoice_no' => $agreement->invoice_no,
                    'payment_date' => $data['payment_date'],
                    'principal_amount' => $principalApplied,
                    'penalty_amount' => $penaltyApplied,
                    'discount_amount' => $discountApplied,
                    'total_amount' => $principalApplied + $penaltyApplied,
                    'payment_method' => $data['payment_method'],
                    'bank_detail_id' => $data['bank_detail_id'] ?? null,
                    'note' => $data['note'] ?? null,
                    'status' => 'posted',
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]);

                $newBalance = round((float) $target->balance_amount - $principalApplied - $discountApplied, 2);
                $target->update([
                    'amount_pay' => round((float) $target->amount_pay + $principalApplied, 2),
                    'balance_amount' => $newBalance,
                    'up_date' => $data['payment_date'],
                    'cash_payment' => round((float) $target->cash_payment + ($data['payment_method'] === 'cash' ? $principalApplied + $penaltyApplied : 0), 2),
                    'card_payment' => round((float) $target->card_payment + ($data['payment_method'] === 'card' ? $principalApplied + $penaltyApplied : 0), 2),
                    'cheque_payment' => round((float) $target->cheque_payment + ($data['payment_method'] === 'cheque' ? $principalApplied + $penaltyApplied : 0), 2),
                    'bank_transfer' => round((float) $target->bank_transfer + ($data['payment_method'] === 'bank_transfer' ? $principalApplied + $penaltyApplied : 0), 2),
                    'discount' => round((float) $target->discount + $discountApplied, 2),
                    'penalty_amount' => round((float) $target->penalty_amount + $penaltyApplied, 2),
                    'penalty_total_amount' => $penalty['penalty_total_amount'],
                    'is_waived' => (bool) ($data['waive_penalty'] ?? false),
                    'status' => $newBalance <= 0.009 ? 'paid' : 'partial',
                    'last_payment_at' => now(),
                    'UID' => $user->username,
                ]);

                $this->postInstallmentJournal(
                    $paymentNo,
                    $data['payment_date'],
                    $principalApplied,
                    $penaltyApplied,
                    $discountApplied,
                    $data['payment_method'],
                    $user
                );
            }

            if ($remaining > 0.009 || $remainingDiscount > 0.009) {
                throw ValidationException::withMessages([
                    'amount' => 'Payment and discount exceed the remaining agreement balance.',
                ]);
            }

            if ($data['payment_method'] === 'cheque' && $amount > 0) {
                $this->createCustomerCheque(
                    $collectionNo,
                    'HP_INSTALLMENT',
                    $data['payment_date'],
                    $amount,
                    $data['cheque'] ?? [],
                    $user
                );
            }

            $penaltyCollected = round(
                (float) THpInstallmentPayment::query()
                    ->where('collection_no', $collectionNo)
                    ->where('BC', $user->BC)
                    ->sum('penalty_amount'),
                2
            );
            if ($penaltyCollected > 0) {
                $this->recordCustomerLedger(
                    $collectionNo.'-PENALTY',
                    $agreement->customer_code,
                    $penaltyCollected,
                    0,
                    'HP_PENALTY',
                    $data['payment_date'],
                    $user
                );
            }
            $this->recordCustomerLedger(
                $collectionNo,
                $agreement->customer_code,
                0,
                $amount + $discount,
                'HP_INSTALLMENT',
                $data['payment_date'],
                $user
            );

            $agreement->paid_amount = round((float) $agreement->paid_amount + $amount, 2);
            $agreement->outstanding_amount = round(
                (float) $agreement->instalments()->sum('balance_amount'),
                2
            );
            if ((float) $agreement->outstanding_amount <= 0.009) {
                $from = $agreement->status;
                $agreement->status = 'completed';
                $agreement->completed_at = now();
                $this->recordHistory(
                    $agreement,
                    'agreement_completed',
                    $from,
                    'completed',
                    'All installment principal balances were settled.',
                    $data['payment_date'],
                    $user
                );
            } else {
                $this->recordHistory(
                    $agreement,
                    'installment_payment',
                    'active',
                    'active',
                    'Installment payment recorded: '.implode(', ', $paymentNumbers),
                    $data['payment_date'],
                    $user
                );
            }
            $agreement->save();

            return $this->loadAgreement($agreement->id, $user->BC);
        });
    }

    public function convertToCash(int $agreementId, array $data, User $user): THirePurchaseSum
    {
        return DB::transaction(function () use ($agreementId, $data, $user) {
            $agreement = THirePurchaseSum::query()
                ->whereKey($agreementId)
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->firstOrFail();
            if ($agreement->status !== 'active') {
                throw ValidationException::withMessages(['agreement' => 'Only active agreements can be converted.']);
            }

            $discount = round((float) ($data['discount'] ?? 0), 2);
            $outstanding = round((float) $agreement->outstanding_amount, 2);
            $settlement = round($outstanding - $discount, 2);
            if ($settlement < 0) {
                throw ValidationException::withMessages(['discount' => 'Discount cannot exceed outstanding balance.']);
            }
            if (abs($settlement - round((float) $data['amount'], 2)) > 0.009) {
                throw ValidationException::withMessages(['amount' => 'Settlement amount must equal outstanding less discount.']);
            }
            $this->validatePaymentMethod($settlement, $data['payment_method'], $data, $user);

            $conversionNo = $this->nextNumber('HPC', $user->BC, THirePurchaseToSale::class, 'conversion_no');
            THirePurchaseToSale::create([
                'conversion_no' => $conversionNo,
                'conversion_date' => $data['conversion_date'],
                'invoice_no' => $agreement->invoice_no,
                'agreement_no' => $agreement->agreement_no,
                'invoice_date' => $agreement->invoice_date,
                'installment_pad_total' => $agreement->paid_amount,
                'customer_nic' => $agreement->customer_nic,
                'customer_name' => $agreement->customer_name,
                'customer_phone' => $agreement->customer_phone,
                'item_net_amount' => $agreement->net_amount,
                'down_payment' => $agreement->down_payment,
                'transport' => $agreement->transport,
                'total_instalment_amount' => $agreement->due_amount,
                'due_amount_as_discount' => $discount,
                'discount' => $discount,
                'Document_Charge' => $agreement->document_charge,
                'amount' => $settlement,
                'cash_payment' => $data['payment_method'] === 'cash' ? $settlement : 0,
                'card_payment' => $data['payment_method'] === 'card' ? $settlement : 0,
                'cheque_payment' => $data['payment_method'] === 'cheque' ? $settlement : 0,
                'bank_transfer' => $data['payment_method'] === 'bank_transfer' ? $settlement : 0,
                'bank_detail_id' => $data['bank_detail_id'] ?? null,
                'conversion_note' => $data['note'] ?? null,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $this->postSettlementJournal(
                'HP_CONVERSION',
                $conversionNo,
                $data['conversion_date'],
                $outstanding,
                $settlement,
                $discount,
                $data['payment_method'],
                $user
            );
            $this->recordCustomerLedger(
                $conversionNo,
                $agreement->customer_code,
                0,
                $outstanding,
                'HP_CONVERSION',
                $data['conversion_date'],
                $user
            );
            if ($data['payment_method'] === 'cheque' && $settlement > 0) {
                $this->createCustomerCheque(
                    $conversionNo,
                    'HP_CONVERSION',
                    $data['conversion_date'],
                    $settlement,
                    $data['cheque'] ?? [],
                    $user
                );
            }

            TInstalment::query()
                ->where('invoice_no', $agreement->invoice_no)
                ->whereIn('status', ['pending', 'partial'])
                ->update(['balance_amount' => 0, 'status' => 'converted', 'UID' => $user->username]);
            THirePurchaseDetail::query()
                ->where('invoice_no', $agreement->invoice_no)
                ->update(['is_cash_converted' => true]);

            $agreement->update([
                'is_cash_converted' => true,
                'status' => 'converted',
                'converted_at' => now(),
                'paid_amount' => round((float) $agreement->paid_amount + $settlement, 2),
                'outstanding_amount' => 0,
                'UID' => $user->username,
            ]);
            $this->recordHistory(
                $agreement,
                'cash_conversion',
                'active',
                'converted',
                "Agreement converted with settlement {$settlement} and discount {$discount}.",
                $data['conversion_date'],
                $user
            );

            return $this->loadAgreement($agreement->id, $user->BC);
        });
    }

    public function returnAgreement(int $agreementId, array $data, User $user): THirePurchaseSum
    {
        return DB::transaction(function () use ($agreementId, $data, $user) {
            $agreement = THirePurchaseSum::query()
                ->whereKey($agreementId)
                ->where('BC', $user->BC)
                ->with('details.item')
                ->lockForUpdate()
                ->firstOrFail();
            if ($agreement->status !== 'active') {
                throw ValidationException::withMessages(['agreement' => 'Only active agreements can be returned.']);
            }

            $store = Store::query()
                ->whereKey($data['store_id'])
                ->where('BC', $user->BC)
                ->firstOrFail();
            $refund = round((float) ($data['refund_amount'] ?? 0), 2);
            if ($refund > (float) $agreement->paid_amount + 0.009) {
                throw ValidationException::withMessages(['refund_amount' => 'Refund cannot exceed collected agreement payments.']);
            }
            if ($refund > 0) {
                $this->validatePaymentMethod($refund, $data['refund_method'] ?? 'cash', $data, $user);
            }

            $returnNo = $this->nextNumber('HPR', $user->BC, THirePurchaseReturnSum::class, 'hpreturn_code', 'bc');
            $return = THirePurchaseReturnSum::create([
                'hpreturn_code' => $returnNo,
                'return_date' => $data['return_date'],
                'store_id' => $store->id,
                'invoice_no' => $agreement->invoice_no,
                'agreement_no' => $agreement->agreement_no,
                'customer_nic' => $agreement->customer_nic,
                'reason' => $data['reason'],
                'gross_amount' => $agreement->gross_amount,
                'net_amount' => $agreement->net_amount,
                'outstanding_written_off' => $agreement->outstanding_amount,
                'refund_amount' => $refund,
                'status' => 'posted',
                'bc' => $user->BC,
                'oc' => $user->username,
            ]);

            foreach ($agreement->details as $detail) {
                $qty = (int) $detail->qty - (int) $detail->returned_qty;
                if ($qty <= 0) {
                    continue;
                }
                $serialNumbers = $detail->serial_numbers ?? [];
                try {
                    $this->stockService->receiveStock(
                        $returnNo,
                        'HP-RETURN',
                        $detail->item_code,
                        $detail->batch_no,
                        $store->id,
                        $qty,
                        (float) $detail->item->standard_purchase_price,
                        (float) $detail->unit_price,
                        $user->BC,
                        $user->username,
                        $serialNumbers
                    );
                } catch (\InvalidArgumentException|\RuntimeException $exception) {
                    throw ValidationException::withMessages(['items' => $exception->getMessage()]);
                }

                THirePurchaseReturnDetail::create([
                    'hpreturn_code' => $returnNo,
                    'item_code' => $detail->item_code,
                    'batch_no' => $detail->batch_no,
                    'store_id' => $store->id,
                    'serial_numbers' => $serialNumbers,
                    'qty' => $qty,
                    'unit_price' => $detail->unit_price,
                    'net_value' => $detail->net_value,
                    'bc' => $user->BC,
                    'oc' => $user->username,
                ]);
                $detail->update(['returned_qty' => $detail->qty]);
            }

            $outstanding = (float) $agreement->outstanding_amount;
            if ($outstanding > 0) {
                $this->accountingService->postBalanced(
                    'HP_RETURN_WRITEOFF',
                    $returnNo.'-WO',
                    $data['return_date'],
                    AccountingService::SALES_DISCOUNT,
                    AccountingService::HP_RECEIVABLE,
                    $outstanding,
                    $user
                );
            }
            if ($refund > 0) {
                $this->accountingService->postBalanced(
                    'HP_RETURN_REFUND',
                    $returnNo.'-RF',
                    $data['return_date'],
                    AccountingService::SALES_DISCOUNT,
                    $this->paymentMethodAccount($data['refund_method'] ?? 'cash'),
                    $refund,
                    $user
                );
            }

            TInstalment::query()
                ->where('invoice_no', $agreement->invoice_no)
                ->whereIn('status', ['pending', 'partial'])
                ->update(['balance_amount' => 0, 'status' => 'cancelled', 'UID' => $user->username]);
            $agreement->update([
                'status' => 'returned',
                'outstanding_amount' => 0,
                'returned_amount' => $agreement->net_amount,
                'completed_at' => now(),
                'UID' => $user->username,
            ]);
            $this->recordHistory(
                $agreement,
                'agreement_returned',
                'active',
                'returned',
                $data['reason'],
                $data['return_date'],
                $user
            );

            return $this->loadAgreement($agreement->id, $user->BC);
        });
    }

    public function getDashboardSummary(string $branchCode): array
    {
        $agreements = THirePurchaseSum::query()->where('BC', $branchCode);
        $installments = TInstalment::query()->where('BC', $branchCode);

        return [
            'active_agreements' => (clone $agreements)->where('status', 'active')->count(),
            'completed_agreements' => (clone $agreements)->where('status', 'completed')->count(),
            'converted_agreements' => (clone $agreements)->where('status', 'converted')->count(),
            'returned_agreements' => (clone $agreements)->where('status', 'returned')->count(),
            'total_outstanding' => round((float) (clone $agreements)->where('status', 'active')->sum('outstanding_amount'), 2),
            'total_collected' => round((float) (clone $agreements)->sum('paid_amount'), 2),
            'overdue_installments' => (clone $installments)
                ->whereIn('status', ['pending', 'partial'])
                ->whereDate('instalment_date', '<', today())
                ->count(),
            'due_today' => (clone $installments)
                ->whereIn('status', ['pending', 'partial'])
                ->whereDate('instalment_date', today())
                ->count(),
        ];
    }

    public function options(User $user): array
    {
        return [
            'customers' => Customer::query()->where('BC', $user->BC)->orderBy('name')->get(),
            'guarantors' => MGuarantor::query()->where('BC', $user->BC)->orderBy('name')->get(),
            'schemas' => MSchema::query()->where('BC', $user->BC)->orderBy('SchemaType')->get(),
            'stores' => Store::query()->where('BC', $user->BC)->orderBy('name')->get(),
            'items' => $this->stockService->getInventorySnapshot($user->BC),
            'bank_accounts' => BankDetail::query()->where('BC', $user->BC)->orderBy('bank_name')->get(),
            'cheque_banks' => $this->chequeEntryService->options($user->BC),
        ];
    }

    public function loadAgreement(int $id, string $branchCode): THirePurchaseSum
    {
        return THirePurchaseSum::query()
            ->whereKey($id)
            ->where('BC', $branchCode)
            ->with([
                'customer',
                'store',
                'schema',
                'details.item',
                'details.store',
                'instalments.payments.bankAccount',
                'histories',
                'conversions',
                'returns.details',
                'advanceAllocations.advance',
            ])
            ->firstOrFail();
    }

    private function prepareLines(array $lines, Collection $items, Store $store, User $user): array
    {
        $prepared = [];
        foreach ($lines as $index => $line) {
            $item = $items->get($line['item_code']);
            if (! $item) {
                throw ValidationException::withMessages(["items.{$index}.item_code" => 'Item is not available in this branch.']);
            }
            $qty = (int) $line['qty'];
            $batchNo = $item->is_batch ? ($line['batch_no'] ?? null) : null;
            $serialNumbers = $line['serial_numbers'] ?? [];
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
                    ->where('store_id', $store->id)
                    ->where('BC', $user->BC)
                    ->first();
                if (! $batch) {
                    throw ValidationException::withMessages(["items.{$index}.batch_no" => 'Selected batch is not available in this store.']);
                }
                $unitPrice = (float) $batch->sales_price;
            } else {
                $unitPrice = round((float) ($line['unit_price'] ?? $item->standard_sales_price), 2);
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

            $gross = round($unitPrice * $qty, 2);
            $discountType = $line['discount_type'] ?? 'amount';
            $discountValue = round((float) ($line['discount'] ?? 0), 2);
            $discount = $this->resolveDiscountAmount(
                $gross,
                $discountValue,
                $discountType,
                "items.{$index}.discount"
            );
            $net = round($gross - $discount, 2);
            if ($net < 0) {
                throw ValidationException::withMessages(["items.{$index}.discount" => 'Discount cannot exceed line value.']);
            }
            $prepared[] = compact('index', 'item', 'qty', 'batchNo', 'serialNumbers') + [
                'batch_no' => $batchNo,
                'serial_numbers' => $serialNumbers,
                'unit_price' => $unitPrice,
                'gross_value' => $gross,
                'discount' => $discount,
                'discount_type' => $discountType,
                'discount_value' => $discountValue,
                'net_value' => $net,
            ];
        }
        return $prepared;
    }

    private function createSchedule(THirePurchaseSum $agreement, array $calc, User $user): void
    {
        $remaining = (float) $calc['gross_hp_amount'];
        $invoiceDate = Carbon::parse($agreement->invoice_date);
        for ($number = 1; $number <= $calc['no_of_installments']; $number++) {
            $amount = $number === $calc['no_of_installments']
                ? round($remaining, 2)
                : min(round((float) $calc['installment_monthly'], 2), round($remaining, 2));
            $remaining = round($remaining - $amount, 2);
            $month = $invoiceDate->copy()->addMonthsNoOverflow($number);
            $dueDay = min((int) $agreement->instalment_due_date, $month->daysInMonth);
            $dueDate = $month->setDay($dueDay);

            TInstalment::create([
                'invoice_no' => $agreement->invoice_no,
                'agreement_no' => $agreement->agreement_no,
                'invoice_date' => $agreement->invoice_date,
                'customer_code' => $agreement->customer_code,
                'customer_name' => $agreement->customer_name,
                'instalment_no' => $number,
                'instalment_date' => $dueDate->format('Y-m-d'),
                'instalment_amount' => $amount,
                'base_amount' => $amount,
                'instalment' => $amount,
                'amount_pay' => 0,
                'balance_amount' => $amount,
                'status' => 'pending',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);
        }
    }

    private function postAgreementJournal(THirePurchaseSum $agreement, array $calc, User $user): void
    {
        $lines = [
            ['account' => AccountingService::HP_RECEIVABLE, 'debit' => $calc['contract_amount']],
            ['account' => AccountingService::SALES_INCOME, 'credit' => $agreement->net_amount],
            ['account' => AccountingService::HP_INTEREST_INCOME, 'credit' => $calc['interest_amount']],
            ['account' => AccountingService::DOCUMENT_CHARGE_INCOME, 'credit' => $calc['document_charge']],
            ['account' => AccountingService::TRANSPORT_INCOME, 'credit' => $calc['transport']],
        ];
        $this->accountingService->postJournal(
            'HP_AGREEMENT',
            $agreement->invoice_no,
            $agreement->invoice_date->format('Y-m-d'),
            $lines,
            $user
        );
    }

    private function postReceipt(
        string $type,
        string $number,
        string $date,
        float $amount,
        string $method,
        string $creditAccount,
        User $user
    ): void {
        if ($amount <= 0) {
            return;
        }
        $this->accountingService->postBalanced(
            $type,
            $number,
            $date,
            $this->paymentMethodAccount($method),
            $creditAccount,
            $amount,
            $user
        );
    }

    private function postInstallmentJournal(
        string $paymentNo,
        string $date,
        float $principal,
        float $penalty,
        float $discount,
        string $method,
        User $user
    ): void {
        $lines = [
            ['account' => $this->paymentMethodAccount($method), 'debit' => $principal + $penalty],
            ['account' => AccountingService::SALES_DISCOUNT, 'debit' => $discount],
            ['account' => AccountingService::HP_RECEIVABLE, 'credit' => $principal + $discount],
            ['account' => AccountingService::PENALTY_INCOME, 'credit' => $penalty],
        ];
        $this->accountingService->postJournal('HP_INSTALLMENT', $paymentNo, $date, $lines, $user);
    }

    private function postSettlementJournal(
        string $type,
        string $number,
        string $date,
        float $outstanding,
        float $settlement,
        float $discount,
        string $method,
        User $user
    ): void {
        $this->accountingService->postJournal($type, $number, $date, [
            ['account' => $this->paymentMethodAccount($method), 'debit' => $settlement],
            ['account' => AccountingService::SALES_DISCOUNT, 'debit' => $discount],
            ['account' => AccountingService::HP_RECEIVABLE, 'credit' => $outstanding],
        ], $user);
    }

    private function paymentMethodAccount(string $method): string
    {
        return match ($method) {
            'bank_transfer', 'card' => AccountingService::BANK,
            'cheque' => AccountingService::CHEQUES_IN_HAND,
            default => AccountingService::CASH,
        };
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

    private function validatePaymentMethod(float $amount, string $method, array $data, User $user): void
    {
        if (! in_array($method, ['cash', 'card', 'cheque', 'bank_transfer'], true)) {
            throw ValidationException::withMessages(['payment_method' => 'Select a valid payment method.']);
        }
        if ($amount <= 0) {
            return;
        }
        if (in_array($method, ['card', 'bank_transfer'], true)) {
            $exists = BankDetail::query()
                ->whereKey($data['bank_detail_id'] ?? null)
                ->where('BC', $user->BC)
                ->exists();
            if (! $exists) {
                throw ValidationException::withMessages(['bank_detail_id' => 'Select a valid branch bank account.']);
            }
        }
        if ($method === 'cheque') {
            foreach (['bank_id', 'bank_branch_id', 'cheque_no', 'account_no', 'due_date'] as $field) {
                if (blank($data['cheque'][$field] ?? null)) {
                    throw ValidationException::withMessages(["cheque.{$field}" => 'Cheque details are required.']);
                }
            }
            $this->chequeEntryService->validateSource($data['cheque'], $user);
        }
    }

    private function createCustomerCheque(
        string $transactionNo,
        string $transactionType,
        string $date,
        float $amount,
        array $chequeData,
        User $user
    ): void {
        $this->chequeEntryService->createCustomer(
            $transactionNo,
            $transactionType,
            $date,
            $amount,
            $chequeData,
            $user,
            AccountingService::HP_RECEIVABLE,
            false
        );
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
            TCustomerHpAdvanceAllocation::create([
                'advance_payment_no' => $advance->payment_no,
                'hp_invoice_no' => $invoiceNo,
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

    private function recordHistory(
        THirePurchaseSum $agreement,
        string $event,
        ?string $from,
        string $to,
        ?string $description,
        string $date,
        User $user
    ): void {
        HpStatusHistory::create([
            'invoice_no' => $agreement->invoice_no,
            'event' => $event,
            'from_status' => $from,
            'to_status' => $to,
            'description' => $description,
            'event_date' => $date,
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);
    }

    private function nextNumber(
        string $prefix,
        string $branchCode,
        string $modelClass,
        string $column,
        string $branchColumn = 'BC'
    ): string {
        $sequence = $modelClass::query()
            ->where($branchColumn, $branchCode)
            ->whereDate('created_at', today())
            ->count() + 1;

        return "{$prefix}-{$branchCode}-".now()->format('Ymd').'-'.str_pad($sequence, 4, '0', STR_PAD_LEFT);
    }
}
