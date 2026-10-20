<?php

namespace App\Services;

use App\Models\BankBranch;
use App\Models\BankDetail;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Color;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Make;
use App\Models\MGuarantor;
use App\Models\MSalesman;
use App\Models\MSchema;
use App\Models\Role;
use App\Models\SalesReturnReason;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\TPaymentVoucher;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ReportDemoDataService
{
    public const PREFIX = 'RPTDEMO';

    public function __construct(
        private readonly AccountingService $accountingService,
        private readonly FinancialService $financialService,
        private readonly HPService $hpService,
        private readonly PurchaseService $purchaseService,
        private readonly ReportingService $reportingService,
        private readonly SalesService $salesService,
        private readonly StockService $stockService
    ) {
    }

    public function seed(string $branchCode = 'HQ', ?string $username = null): array
    {
        $this->clear($branchCode);

        return DB::transaction(function () use ($branchCode, $username) {
            $user = $this->resolveUser($branchCode, $username);
            $today = Carbon::today()->format('Y-m-d');
            [$mainStore, $warehouseStore] = $this->resolveStores($user);

            $this->accountingService->ensureSystemAccounts($user);

            $bank = BankDetail::query()->firstOrCreate(
                [
                    'bank_name' => self::PREFIX.' Internal Bank',
                    'account_no' => self::PREFIX.'-BANK-001',
                    'BC' => $user->BC,
                ],
                ['UID' => $user->username]
            );

            BankBranch::query()->firstOrCreate(
                [
                    'bank_id' => $bank->id,
                    'branch_code' => 'RPTBR001',
                ],
                [
                    'branch_name' => self::PREFIX.' Main Branch',
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]
            );

            $parentCategory = Category::query()->create([
                'name' => self::PREFIX.' Electronics',
                'parent_id' => null,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $childCategory = Category::query()->create([
                'name' => self::PREFIX.' Appliances',
                'parent_id' => $parentCategory->id,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $brand = Brand::query()->create([
                'name' => self::PREFIX.' Prime',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $make = Make::query()->create([
                'name' => self::PREFIX.' Series A',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $color = Color::query()->create([
                'name' => self::PREFIX.' Silver',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $supplier = Supplier::query()->create([
                'Code' => self::PREFIX.'-SUP-001',
                'name' => self::PREFIX.' Supplier',
                'phone' => '0117000001',
                'address' => 'Demo Supplier Address',
                'type' => 'normal',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $customerOne = Customer::query()->create([
                'Code' => self::PREFIX.'-CUS-001',
                'name' => self::PREFIX.' Customer One',
                'NIC' => self::PREFIX.'NIC001',
                'phone' => '0777000001',
                'address' => 'Demo Customer Address 1',
                'advance_balance' => 0,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $customerTwo = Customer::query()->create([
                'Code' => self::PREFIX.'-CUS-002',
                'name' => self::PREFIX.' Customer Two',
                'NIC' => self::PREFIX.'NIC002',
                'phone' => '0777000002',
                'address' => 'Demo Customer Address 2',
                'advance_balance' => 0,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $guarantorOne = MGuarantor::query()->create([
                'Code' => self::PREFIX.'-GUA-001',
                'name' => self::PREFIX.' Guarantor One',
                'NIC' => self::PREFIX.'GUA001',
                'phone' => '0777000011',
                'address' => 'Demo Guarantor 1',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $guarantorTwo = MGuarantor::query()->create([
                'Code' => self::PREFIX.'-GUA-002',
                'name' => self::PREFIX.' Guarantor Two',
                'NIC' => self::PREFIX.'GUA002',
                'phone' => '0777000012',
                'address' => 'Demo Guarantor 2',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $salesman = MSalesman::query()->create([
                'name' => self::PREFIX.' Sales Rep',
                'phone' => '0717000001',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $returnReason = SalesReturnReason::query()->create([
                'reason' => self::PREFIX.' Demonstration return reason',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $schema = MSchema::query()->create([
                'SchemaType' => self::PREFIX.'-HP-06',
                'DownpaymentPrecentage' => 20,
                'InstallmentRate' => 12,
                'NoOfInstallment' => 6,
                'DocumentCharagePrecentage' => 2,
                'PanaltyCharage' => 2.5,
                'GracePeriodDays' => 5,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $batchItem = Item::query()->create([
                'item_code' => self::PREFIX.'-BAT-SER-001',
                'item_description' => self::PREFIX.' Batch Serialized Washer',
                'category_id' => $childCategory->id,
                'brand_id' => $brand->id,
                'make_id' => $make->id,
                'color_id' => $color->id,
                'is_batch' => true,
                'default_batch_price_mode' => 'batch',
                'is_serialized' => true,
                'reorder_level' => 1,
                'standard_purchase_price' => 0,
                'standard_sales_price' => 0,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $standardItem = Item::query()->create([
                'item_code' => self::PREFIX.'-STD-001',
                'item_description' => self::PREFIX.' Standard Rice Cooker',
                'category_id' => $childCategory->id,
                'brand_id' => $brand->id,
                'make_id' => $make->id,
                'color_id' => $color->id,
                'is_batch' => false,
                'default_batch_price_mode' => 'batch',
                'is_serialized' => false,
                'reorder_level' => 2,
                'standard_purchase_price' => 850,
                'standard_sales_price' => 1200,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $order = $this->purchaseService->createOrder([
                'po_date' => $today,
                'expected_date' => Carbon::today()->addDays(3)->format('Y-m-d'),
                'supplier_code' => $supplier->Code,
                'notes' => self::PREFIX.' seed purchase order',
                'items' => [
                    [
                        'item_code' => $batchItem->item_code,
                        'qty' => 7,
                        'unit_price' => 30000,
                    ],
                    [
                        'item_code' => $standardItem->item_code,
                        'qty' => 8,
                        'unit_price' => 800,
                    ],
                ],
            ], $user);
            $this->purchaseService->approveOrder($order, $user);

            $receiptOne = $this->purchaseService->createReceipt([
                'invoice_date' => $today,
                'reference_no' => self::PREFIX.'-GRN-001',
                'supplier_code' => $supplier->Code,
                'purchase_order_no' => $order->po_no,
                'store_id' => $mainStore->id,
                'cash_payment' => 20000,
                'items' => [
                    [
                        'item_code' => $batchItem->item_code,
                        'qty' => 3,
                        'unit_price' => 30000,
                        'sales_price' => 42000,
                        'price_mode' => 'average',
                        'batch_no' => self::PREFIX.'-B001',
                        'serial_numbers' => [
                            self::PREFIX.'-SER-001',
                            self::PREFIX.'-SER-002',
                            self::PREFIX.'-SER-003',
                        ],
                    ],
                    [
                        'item_code' => $standardItem->item_code,
                        'qty' => 5,
                        'unit_price' => 800,
                    ],
                ],
            ], $user);

            $receiptTwo = $this->purchaseService->createReceipt([
                'invoice_date' => $today,
                'reference_no' => self::PREFIX.'-GRN-002',
                'supplier_code' => $supplier->Code,
                'purchase_order_no' => $order->po_no,
                'store_id' => $mainStore->id,
                'items' => [
                    [
                        'item_code' => $batchItem->item_code,
                        'qty' => 4,
                        'unit_price' => 32000,
                        'sales_price' => 46000,
                        'price_mode' => 'average',
                        'batch_no' => self::PREFIX.'-B002',
                        'serial_numbers' => [
                            self::PREFIX.'-SER-004',
                            self::PREFIX.'-SER-005',
                            self::PREFIX.'-SER-006',
                            self::PREFIX.'-SER-007',
                        ],
                    ],
                    [
                        'item_code' => $standardItem->item_code,
                        'qty' => 3,
                        'unit_price' => 820,
                    ],
                ],
            ], $user);

            $this->stockService->transferStock(
                self::PREFIX.'-TRF-001',
                $batchItem->item_code,
                self::PREFIX.'-B002',
                $mainStore->id,
                $warehouseStore->id,
                1,
                $user->BC,
                $user->username,
                [self::PREFIX.'-SER-007']
            );

            $this->stockService->transferStock(
                self::PREFIX.'-TRF-002',
                $standardItem->item_code,
                null,
                $mainStore->id,
                $warehouseStore->id,
                2,
                $user->BC,
                $user->username
            );

            $supplierPayment = $this->purchaseService->createPayment([
                'payment_date' => $today,
                'supplier_code' => $supplier->Code,
                'payment_note' => self::PREFIX.' supplier settlement',
                'payment_amount' => 30000,
                'bank_transfer' => 30000,
                'bank_detail_id' => $bank->id,
                'allocations' => [
                    [
                        'purchase_invoice_no' => $receiptOne->Invoice_no,
                        'amount' => 30000,
                    ],
                ],
            ], $user);

            $advanceOne = $this->salesService->createAdvance([
                'payment_date' => $today,
                'customer_code' => $customerOne->Code,
                'payment_note' => self::PREFIX.' initial customer advance',
                'amount' => 7000,
                'cash_payment' => 7000,
            ], $user);

            $invoiceOne = $this->salesService->createInvoice([
                'invoice_date' => $today,
                'reference_no' => self::PREFIX.'-SALE-001',
                'customer_code' => $customerOne->Code,
                'store_id' => $mainStore->id,
                'salesman_id' => $salesman->id,
                'advance_amount' => 5000,
                'cash_payment' => 15000,
                'items' => [
                    [
                        'item_code' => $batchItem->item_code,
                        'batch_no' => self::PREFIX.'-B001',
                        'qty' => 2,
                        'serial_numbers' => [
                            self::PREFIX.'-SER-001',
                            self::PREFIX.'-SER-002',
                        ],
                    ],
                ],
            ], $user);

            $invoiceTwo = $this->salesService->createInvoice([
                'invoice_date' => $today,
                'reference_no' => self::PREFIX.'-SALE-002',
                'customer_code' => $customerTwo->Code,
                'store_id' => $warehouseStore->id,
                'cash_payment' => 2400,
                'items' => [
                    [
                        'item_code' => $standardItem->item_code,
                        'qty' => 2,
                    ],
                ],
            ], $user);

            $this->salesService->createCustomerPayment([
                'payment_date' => $today,
                'customer_code' => $customerOne->Code,
                'payment_note' => self::PREFIX.' invoice settlement',
                'payment_amount' => 20000,
                'bank_transfer' => 20000,
                'bank_detail_id' => $bank->id,
                'allocations' => [
                    [
                        'sales_invoice_no' => $invoiceOne->Invoice_no,
                        'amount' => 20000,
                    ],
                ],
            ], $user);

            $this->salesService->createReturn([
                'return_date' => $today,
                'invoice_no' => $invoiceTwo->Invoice_no,
                'reason_id' => $returnReason->id,
                'refund_method' => 'cash',
                'items' => [
                    [
                        'invoice_detail_id' => $invoiceTwo->details->first()->id,
                        'qty' => 1,
                    ],
                ],
            ], $user);

            $advanceTwo = $this->salesService->createAdvance([
                'payment_date' => $today,
                'customer_code' => $customerTwo->Code,
                'payment_note' => self::PREFIX.' hp down-payment advance',
                'amount' => 3000,
                'cash_payment' => 3000,
            ], $user);

            $agreement = $this->hpService->createAgreement([
                'invoice_date' => $today,
                'reference_no' => self::PREFIX.'-HP-001',
                'customer_code' => $customerTwo->Code,
                'guarantor_1_code' => $guarantorOne->Code,
                'guarantor_2_code' => $guarantorTwo->Code,
                'schema_type' => $schema->SchemaType,
                'store_id' => $mainStore->id,
                'down_payment' => 15000,
                'advance_amount' => 3000,
                'down_payment_method' => 'bank_transfer',
                'bank_detail_id' => $bank->id,
                'transport' => 2000,
                'instalment_due_date' => 10,
                'items' => [
                    [
                        'item_code' => $batchItem->item_code,
                        'batch_no' => self::PREFIX.'-B002',
                        'qty' => 1,
                        'serial_numbers' => [self::PREFIX.'-SER-004'],
                    ],
                ],
            ], $user);

            $firstInstallment = $agreement->instalments->sortBy('instalment_no')->first();
            $agreement = $this->hpService->payInstallment($firstInstallment->id, [
                'payment_date' => $today,
                'amount' => (float) $firstInstallment->balance_amount,
                'payment_method' => 'cash',
                'note' => self::PREFIX.' first installment payment',
            ], $user);

            $expense = $this->financialService->createExpense([
                'expense_date' => $today,
                'expense_account_code' => AccountingService::GENERAL_EXPENSE,
                'amount' => 2500,
                'payment_method' => 'cash',
                'note' => self::PREFIX.' operating expense',
            ], $user);

            $bankEntry = $this->financialService->createBankEntry([
                'date' => $today,
                'bank_detail_id' => $bank->id,
                'entry_type' => 'deposit',
                'offset_account_code' => AccountingService::CASH,
                'amount' => 10000,
                'bank_charges' => 100,
                'description' => self::PREFIX.' cash deposit to bank',
            ], $user);

            $voucher = $this->financialService->createVoucher([
                'date' => $today,
                'debit_account_code' => AccountingService::GENERAL_EXPENSE,
                'amount' => 500,
                'payment_method' => 'cash',
                'description' => self::PREFIX.' petty cash voucher',
            ], $user);
            $voucher = $this->financialService->postVoucher($voucher, $user);

            $overview = $this->reportingService->overview($user, $today, $today);
            $stock = $this->reportingService->stockInHand($user, []);
            $binCard = $this->reportingService->binCard($user, [
                'item_code' => $batchItem->item_code,
                'from' => $today,
                'to' => $today,
            ]);
            $purchases = $this->reportingService->purchases($user, [
                'mode' => 'detail',
                'from' => $today,
                'to' => $today,
            ]);
            $sales = $this->reportingService->sales($user, [
                'mode' => 'detail',
                'from' => $today,
                'to' => $today,
            ]);
            $hirePurchase = $this->reportingService->hirePurchase($user, [
                'mode' => 'detail',
                'from' => $today,
                'to' => $today,
            ]);
            $cashFlow = $this->reportingService->cashFlow($user, [
                'from' => $today,
                'to' => $today,
                'account_code' => AccountingService::CASH,
            ]);

            return [
                'branch' => $user->BC,
                'seed_prefix' => self::PREFIX,
                'stores' => [
                    'main' => $mainStore->name,
                    'secondary' => $warehouseStore->name,
                ],
                'masters' => [
                    'supplier_code' => $supplier->Code,
                    'customers' => [$customerOne->Code, $customerTwo->Code],
                    'items' => [$batchItem->item_code, $standardItem->item_code],
                    'schema_type' => $schema->SchemaType,
                ],
                'transactions' => [
                    'purchase_order' => $order->po_no,
                    'purchase_receipts' => [$receiptOne->Invoice_no, $receiptTwo->Invoice_no],
                    'supplier_payment' => $supplierPayment->Payment_no,
                    'customer_advances' => [$advanceOne->payment_no, $advanceTwo->payment_no],
                    'sales_invoices' => [$invoiceOne->Invoice_no, $invoiceTwo->Invoice_no],
                    'hp_invoice' => $agreement->invoice_no,
                    'hp_agreement' => $agreement->agreement_no,
                    'expense' => $expense->Expense_no,
                    'bank_entry' => $bankEntry->invoice_no,
                    'voucher' => $voucher->invoice_no,
                ],
                'verification' => [
                    'overview_sales' => $overview['sales'],
                    'overview_purchases' => $overview['purchases'],
                    'overview_customer_collections' => $overview['customer_collections'],
                    'stock_rows' => count($stock['rows']),
                    'bin_card_rows' => count($binCard['rows']),
                    'purchase_rows' => count($purchases['rows']),
                    'sales_rows' => count($sales['rows']),
                    'hp_rows' => count($hirePurchase['rows']),
                    'cash_rows' => count($cashFlow['rows']),
                ],
            ];
        });
    }

    public function clear(string $branchCode = 'HQ'): array
    {
        return DB::transaction(function () use ($branchCode) {
            $prefix = self::PREFIX.'%';

            $customerCodes = Customer::query()
                ->where('BC', $branchCode)
                ->where('Code', 'like', $prefix)
                ->pluck('Code');
            $customerNics = Customer::query()
                ->where('BC', $branchCode)
                ->where('Code', 'like', $prefix)
                ->pluck('NIC');
            $supplierCodes = Supplier::query()
                ->where('BC', $branchCode)
                ->where('Code', 'like', $prefix)
                ->pluck('Code');
            $itemCodes = Item::query()
                ->where('BC', $branchCode)
                ->where('item_code', 'like', $prefix)
                ->pluck('item_code');
            $bankIds = BankDetail::query()
                ->where('BC', $branchCode)
                ->where('bank_name', 'like', $prefix)
                ->pluck('id');
            $schemaTypes = MSchema::query()
                ->where('BC', $branchCode)
                ->where('SchemaType', 'like', $prefix)
                ->pluck('SchemaType');
            $salesmanIds = MSalesman::query()
                ->where('BC', $branchCode)
                ->where('name', 'like', $prefix)
                ->pluck('id');
            $reasonIds = SalesReturnReason::query()
                ->where('BC', $branchCode)
                ->where('reason', 'like', $prefix)
                ->pluck('id');
            $categoryIds = Category::query()
                ->where('BC', $branchCode)
                ->where('name', 'like', $prefix)
                ->pluck('id');
            $brandIds = Brand::query()
                ->where('BC', $branchCode)
                ->where('name', 'like', $prefix)
                ->pluck('id');
            $makeIds = Make::query()
                ->where('BC', $branchCode)
                ->where('name', 'like', $prefix)
                ->pluck('id');
            $colorIds = Color::query()
                ->where('BC', $branchCode)
                ->where('name', 'like', $prefix)
                ->pluck('id');
            $guarantorCodes = MGuarantor::query()
                ->where('BC', $branchCode)
                ->where('Code', 'like', $prefix)
                ->pluck('Code');
            $demoStoreIds = Store::query()
                ->where('BC', $branchCode)
                ->where('name', 'like', $prefix)
                ->pluck('id');

            $purchaseOrderNos = DB::table('t_purchase_order_sums')
                ->where('BC', $branchCode)
                ->where(function ($query) use ($supplierCodes, $prefix) {
                    if ($supplierCodes->isNotEmpty()) {
                        $query->whereIn('supplier_code', $supplierCodes);
                    }
                    $query->orWhere('notes', 'like', $prefix);
                })
                ->pluck('po_no');

            $purchaseInvoiceNos = DB::table('t_purchases_sums')
                ->where('BC', $branchCode)
                ->where(function ($query) use ($supplierCodes, $prefix) {
                    if ($supplierCodes->isNotEmpty()) {
                        $query->whereIn('supplier_code', $supplierCodes);
                    }
                    $query->orWhere('Ref_no', 'like', $prefix);
                })
                ->pluck('Invoice_no');

            $supplierPaymentNos = DB::table('t_supplier_payments')
                ->where('BC', $branchCode)
                ->where(function ($query) use ($supplierCodes, $prefix) {
                    if ($supplierCodes->isNotEmpty()) {
                        $query->whereIn('Supplier_Code', $supplierCodes);
                    }
                    $query->orWhere('Payment_note', 'like', $prefix);
                })
                ->pluck('Payment_no');

            $advanceNos = DB::table('t_advanc_cus_payments')
                ->where('BC', $branchCode)
                ->where(function ($query) use ($customerNics, $prefix) {
                    if ($customerNics->isNotEmpty()) {
                        $query->whereIn('customer_nic', $customerNics);
                    }
                    $query->orWhere('payment_note', 'like', $prefix);
                })
                ->pluck('payment_no');

            $salesInvoiceNos = DB::table('t_invoice_sums')
                ->where('BC', $branchCode)
                ->where(function ($query) use ($customerCodes, $prefix) {
                    if ($customerCodes->isNotEmpty()) {
                        $query->whereIn('customer_code', $customerCodes);
                    }
                    $query->orWhere('reference_no', 'like', $prefix);
                })
                ->pluck('Invoice_no');

            $customerPaymentNos = DB::table('t_customer_payments')
                ->where('BC', $branchCode)
                ->where(function ($query) use ($customerNics, $prefix) {
                    if ($customerNics->isNotEmpty()) {
                        $query->whereIn('Customer_NIC', $customerNics);
                    }
                    $query->orWhere('Payment_note', 'like', $prefix);
                })
                ->pluck('Payment_no');

            $salesReturnNos = DB::table('t_sales_return_sums')
                ->where('BC', $branchCode)
                ->where(function ($query) use ($salesInvoiceNos) {
                    if ($salesInvoiceNos->isNotEmpty()) {
                        $query->whereIn('invoice_no', $salesInvoiceNos);
                    }
                })
                ->pluck('return_no');

            $hpInvoiceNos = DB::table('t_hire_purchase_sums')
                ->where('BC', $branchCode)
                ->where(function ($query) use ($customerCodes, $prefix) {
                    if ($customerCodes->isNotEmpty()) {
                        $query->whereIn('customer_code', $customerCodes);
                    }
                    $query->orWhere('reference_no', 'like', $prefix);
                })
                ->pluck('invoice_no');

            $hpAgreementNos = DB::table('t_hire_purchase_sums')
                ->where('BC', $branchCode)
                ->whereIn('invoice_no', $hpInvoiceNos->isEmpty() ? [''] : $hpInvoiceNos)
                ->pluck('agreement_no');

            $hpReturnNos = DB::table('t_hire_purchase_return_sums')
                ->where('bc', $branchCode)
                ->where(function ($query) use ($hpInvoiceNos, $prefix) {
                    if ($hpInvoiceNos->isNotEmpty()) {
                        $query->whereIn('invoice_no', $hpInvoiceNos);
                    }
                    $query->orWhere('reason', 'like', $prefix);
                })
                ->pluck('hpreturn_code');

            $hpPaymentRows = DB::table('t_hp_installment_payments')
                ->where('BC', $branchCode)
                ->whereIn('invoice_no', $hpInvoiceNos->isEmpty() ? [''] : $hpInvoiceNos)
                ->get(['payment_no', 'collection_no']);
            $hpPaymentNos = $hpPaymentRows->pluck('payment_no');
            $hpCollectionNos = $hpPaymentRows->pluck('collection_no')->filter();

            $expenseNos = DB::table('t_expenses')
                ->where('BC', $branchCode)
                ->where('Expense_note', 'like', $prefix)
                ->pluck('Expense_no');

            $bankEntryNos = DB::table('t_bank_entries')
                ->where('BC', $branchCode)
                ->where('description', 'like', $prefix)
                ->pluck('invoice_no');

            $voucherNos = DB::table('t_payment_vouchers')
                ->where('BC', $branchCode)
                ->where('description', 'like', $prefix)
                ->pluck('invoice_no');

            $baseNumbers = collect()
                ->merge($purchaseOrderNos)
                ->merge($purchaseInvoiceNos)
                ->merge($supplierPaymentNos)
                ->merge($advanceNos)
                ->merge($salesInvoiceNos)
                ->merge($customerPaymentNos)
                ->merge($salesReturnNos)
                ->merge($hpInvoiceNos)
                ->merge($hpAgreementNos)
                ->merge($hpReturnNos)
                ->merge($hpPaymentNos)
                ->merge($hpCollectionNos)
                ->merge($expenseNos)
                ->merge($bankEntryNos)
                ->merge($voucherNos)
                ->merge([self::PREFIX.'-TRF-001', self::PREFIX.'-TRF-002'])
                ->filter()
                ->unique()
                ->values();

            $deleted = [];

            $deleted['customer_advance_allocations'] = $this->deleteWhereIn('t_customer_advance_allocations', 'advance_payment_no', $advanceNos)
                + $this->deleteWhereIn('t_customer_advance_allocations', 'sales_invoice_no', $salesInvoiceNos);
            $deleted['customer_hp_advance_allocations'] = $this->deleteWhereIn('t_customer_hp_advance_allocations', 'advance_payment_no', $advanceNos)
                + $this->deleteWhereIn('t_customer_hp_advance_allocations', 'hp_invoice_no', $hpInvoiceNos);
            $deleted['customer_invoice_payments'] = $this->deleteWhereIn('t_customer_invoice_payments', 'payment_no', $customerPaymentNos)
                + $this->deleteWhereIn('t_customer_invoice_payments', 'sales_invoice_no', $salesInvoiceNos);
            $deleted['supplier_invoice_payments'] = $this->deleteWhereIn('t_supplier_invoice_payments', 'payment_no', $supplierPaymentNos)
                + $this->deleteWhereIn('t_supplier_invoice_payments', 'purchase_invoice_no', $purchaseInvoiceNos);
            $deleted['hp_installment_payments'] = $this->deleteWhereIn('t_hp_installment_payments', 'payment_no', $hpPaymentNos)
                + $this->deleteWhereIn('t_hp_installment_payments', 'invoice_no', $hpInvoiceNos);
            $deleted['hp_status_histories'] = $this->deleteWhereIn('hp_status_histories', 'invoice_no', $hpInvoiceNos);
            $deleted['sales_return_details'] = $this->deleteWhereIn('t_sales_return_details', 'return_no', $salesReturnNos);
            $deleted['sales_returns'] = $this->deleteWhereIn('t_sales_return_sums', 'return_no', $salesReturnNos)
                + $this->deleteWhereIn('t_sales_return_sums', 'invoice_no', $salesInvoiceNos);
            $deleted['hp_return_details'] = $this->deleteWhereIn('t_hire_purchase_return_details', 'hpreturn_code', $hpReturnNos);
            $deleted['hp_returns'] = $this->deleteWhereIn('t_hire_purchase_return_sums', 'hpreturn_code', $hpReturnNos)
                + $this->deleteWhereIn('t_hire_purchase_return_sums', 'invoice_no', $hpInvoiceNos);
            $deleted['hp_conversions'] = $this->deleteWhereIn('t_hire_purchase_to_sales', 'invoice_no', $hpInvoiceNos);
            $deleted['installments'] = $this->deleteWhereIn('t_instalments', 'invoice_no', $hpInvoiceNos);
            $deleted['hp_details'] = $this->deleteWhereIn('t_hire_purchase_details', 'invoice_no', $hpInvoiceNos);
            $deleted['hp_sums'] = $this->deleteWhereIn('t_hire_purchase_sums', 'invoice_no', $hpInvoiceNos);
            $deleted['invoice_details'] = $this->deleteWhereIn('t_invoice_deils', 'Invoice_no', $salesInvoiceNos);
            $deleted['invoice_sums'] = $this->deleteWhereIn('t_invoice_sums', 'Invoice_no', $salesInvoiceNos);
            $deleted['customer_payments'] = $this->deleteWhereIn('t_customer_payments', 'Payment_no', $customerPaymentNos);
            $deleted['customer_advances'] = $this->deleteWhereIn('t_advanc_cus_payments', 'payment_no', $advanceNos);
            $deleted['purchase_details'] = $this->deleteWhereIn('t_purchases_details', 'Invoice_no', $purchaseInvoiceNos);
            $deleted['purchase_sums'] = $this->deleteWhereIn('t_purchases_sums', 'Invoice_no', $purchaseInvoiceNos);
            $deleted['supplier_payments'] = $this->deleteWhereIn('t_supplier_payments', 'Payment_no', $supplierPaymentNos);
            $deleted['purchase_order_details'] = $this->deleteWhereIn('t_purchases_order_details', 'po_no', $purchaseOrderNos);
            $deleted['purchase_orders'] = $this->deleteWhereIn('t_purchase_order_sums', 'po_no', $purchaseOrderNos);
            $deleted['item_serial_movements'] = $this->deleteWhereIn('t_item_serial_movements', 'item_code', $itemCodes);
            $deleted['item_movements'] = $this->deleteWhereIn('t_item_movements', 'item_code', $itemCodes);
            $deleted['item_batches'] = $this->deleteWhereIn('item_batches', 'item_code', $itemCodes);
            $deleted['customer_ledgers'] = $this->deleteWhereIn('t_customer_account_trances', 'customer_code', $customerCodes);
            $deleted['supplier_ledgers'] = $this->deleteWhereIn('t_sup_purchase_trances', 'supplier', $supplierCodes);
            $deleted['payment_vouchers'] = $this->deleteWhereIn('t_payment_vouchers', 'invoice_no', $voucherNos);
            $deleted['bank_entries'] = $this->deleteWhereIn('t_bank_entries', 'invoice_no', $bankEntryNos);
            $deleted['expenses'] = $this->deleteWhereIn('t_expenses', 'Expense_no', $expenseNos);
            $deleted['account_trans'] = $this->deleteAccountTransactions($branchCode, $baseNumbers);
            $deleted['bank_branches'] = $this->deleteWhereIn('bank_branches', 'bank_id', $bankIds);
            $deleted['bank_details'] = $this->deleteWhereIn('bank_details', 'id', $bankIds);
            $deleted['salespeople'] = $this->deleteWhereIn('m_salesmen', 'id', $salesmanIds);
            $deleted['return_reasons'] = $this->deleteWhereIn('sales_return_reasons', 'id', $reasonIds);
            $deleted['guarantors'] = $this->deleteWhereIn('m_guarantors', 'Code', $guarantorCodes);
            $deleted['items'] = $this->deleteWhereIn('items', 'item_code', $itemCodes);
            $deleted['colors'] = $this->deleteWhereIn('m_colors', 'id', $colorIds);
            $deleted['makes'] = $this->deleteWhereIn('m__makes', 'id', $makeIds);
            $deleted['brands'] = $this->deleteWhereIn('m_brands', 'id', $brandIds);
            $deleted['categories'] = Category::query()
                ->whereIn('id', $categoryIds->sortDesc()->values())
                ->delete();
            $deleted['schemas'] = $this->deleteWhereIn('m_schemas', 'SchemaType', $schemaTypes);
            $deleted['customers'] = $this->deleteWhereIn('customers', 'Code', $customerCodes);
            $deleted['suppliers'] = $this->deleteWhereIn('suppliers', 'Code', $supplierCodes);
            $deleted['demo_stores'] = $this->deleteWhereIn('stores', 'id', $demoStoreIds);

            return [
                'branch' => $branchCode,
                'seed_prefix' => self::PREFIX,
                'deleted' => $deleted,
            ];
        });
    }

    private function resolveUser(string $branchCode, ?string $username): User
    {
        $query = User::query()->where('BC', $branchCode);

        if ($username) {
            $user = (clone $query)
                ->where(function ($builder) use ($username) {
                    $builder->where('username', $username)
                        ->orWhere('email', $username);
                })
                ->first();

            if ($user) {
                return $user;
            }
        }

        return (clone $query)
            ->whereHas('role', fn ($role) => $role->where('name', Role::SUPER_ADMIN))
            ->orderBy('id')
            ->first()
            ?? (clone $query)->orderBy('id')->firstOrFail();
    }

    private function resolveStores(User $user): array
    {
        $mainStore = Store::query()
            ->where('BC', $user->BC)
            ->where('name', 'Main Store')
            ->first()
            ?? Store::query()->where('BC', $user->BC)->orderBy('id')->firstOrFail();

        $warehouseStore = Store::query()
            ->where('BC', $user->BC)
            ->where('name', 'Warehouse')
            ->first();

        if (! $warehouseStore) {
            $warehouseStore = Store::query()->create([
                'name' => self::PREFIX.' Warehouse',
                'location' => $user->BC,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);
        }

        return [$mainStore, $warehouseStore];
    }

    private function deleteWhereIn(string $table, string $column, Collection $values): int
    {
        $values = $values->filter(fn ($value) => filled($value))->unique()->values();

        if ($values->isEmpty()) {
            return 0;
        }

        return DB::table($table)->whereIn($column, $values)->delete();
    }

    private function deleteAccountTransactions(string $branchCode, Collection $numbers): int
    {
        $numbers = $numbers->filter(fn ($value) => filled($value))->unique()->values();

        if ($numbers->isEmpty()) {
            return 0;
        }

        return DB::table('t_account_trans')
            ->where('BC', $branchCode)
            ->where(function ($query) use ($numbers) {
                foreach ($numbers as $number) {
                    $query->orWhere('trance_no', $number)
                        ->orWhere('trance_no', 'like', $number.'-%')
                        ->orWhere('no', $number)
                        ->orWhere('no', 'like', $number.'-%');
                }
            })
            ->delete();
    }
}
