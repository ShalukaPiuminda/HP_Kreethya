<?php

namespace App\Services;

use App\Models\BankDetail;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Supplier;
use App\Models\TServiceCustomerPayment;
use App\Models\TServiceDispatch;
use App\Models\TServiceInvoice;
use App\Models\TServiceIssue;
use App\Models\TServiceItemTrack;
use App\Models\TServiceReturn;
use App\Models\TServiceSupplierPayment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ServiceTicketService
{
    public function __construct(private readonly AccountingService $accountingService)
    {
    }

    public function tickets(array $filters, string $branchCode)
    {
        return TServiceReturn::query()
            ->where('BC', $branchCode)
            ->with($this->relations())
            ->when($filters['status'] ?? null, fn (Builder $query, string $status) => $query->where('status', $status))
            ->when($filters['search'] ?? null, function (Builder $query, string $search) {
                $query->where(function (Builder $nested) use ($search) {
                    $nested->where('ticket_no', 'like', "%{$search}%")
                        ->orWhere('customer_name', 'like', "%{$search}%")
                        ->orWhere('customer_nic', 'like', "%{$search}%")
                        ->orWhere('item_serial_no', 'like', "%{$search}%")
                        ->orWhere('item_code', 'like', "%{$search}%");
                });
            })
            ->when($filters['date_from'] ?? null, fn (Builder $query, string $date) => $query->whereDate('return_date', '>=', $date))
            ->when($filters['date_to'] ?? null, fn (Builder $query, string $date) => $query->whereDate('return_date', '<=', $date))
            ->orderByRaw("CASE status
                WHEN 'received' THEN 1
                WHEN 'dispatched_to_supplier' THEN 2
                WHEN 'received_from_supplier' THEN 3
                WHEN 'under_repair' THEN 4
                WHEN 'repaired' THEN 5
                WHEN 'invoiced' THEN 6
                WHEN 'customer_paid' THEN 7
                ELSE 8 END")
            ->orderByDesc('return_date')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 25);
    }

    public function options(string $branchCode): array
    {
        return [
            'customers' => Customer::query()
                ->where('BC', $branchCode)
                ->orderBy('name')
                ->get(['id', 'Code', 'name', 'NIC', 'phone']),
            'items' => Item::query()
                ->where('BC', $branchCode)
                ->orderBy('item_description')
                ->get(['id', 'item_code', 'item_description', 'is_serialized']),
            'service_suppliers' => Supplier::query()
                ->where('BC', $branchCode)
                ->where('type', 'service')
                ->orderBy('name')
                ->get(['id', 'Code', 'name', 'phone']),
            'bank_accounts' => BankDetail::query()
                ->where('BC', $branchCode)
                ->orderBy('bank_name')
                ->get(['id', 'bank_name', 'account_no']),
        ];
    }

    public function summary(string $branchCode): array
    {
        $statusCounts = TServiceReturn::query()
            ->where('BC', $branchCode)
            ->selectRaw('status, COUNT(*) as ticket_count')
            ->groupBy('status')
            ->pluck('ticket_count', 'status');
        $customerOutstanding = TServiceInvoice::query()
            ->where('BC', $branchCode)
            ->selectRaw('COALESCE(SUM(net_payable - paid_amount), 0) as outstanding')
            ->value('outstanding');
        $supplierOutstanding = TServiceDispatch::query()
            ->where('BC', $branchCode)
            ->selectRaw('COALESCE(SUM(repair_cost - paid_amount), 0) as outstanding')
            ->value('outstanding');

        return [
            'open_tickets' => TServiceReturn::query()
                ->where('BC', $branchCode)
                ->where('status', '!=', 'completed')
                ->count(),
            'completed_tickets' => (int) ($statusCounts['completed'] ?? 0),
            'with_supplier' => (int) ($statusCounts['dispatched_to_supplier'] ?? 0),
            'under_repair' => (int) ($statusCounts['under_repair'] ?? 0),
            'customer_outstanding' => (float) $customerOutstanding,
            'supplier_outstanding' => (float) $supplierOutstanding,
            'status_counts' => $statusCounts,
        ];
    }

    public function createTicket(array $data, User $user): TServiceReturn
    {
        return DB::transaction(function () use ($data, $user) {
            $customer = Customer::query()
                ->where('Code', $data['customer_code'])
                ->where('BC', $user->BC)
                ->firstOrFail();
            $item = Item::query()
                ->where('item_code', $data['item_code'])
                ->where('BC', $user->BC)
                ->firstOrFail();

            if ($item->is_serialized && blank($data['item_serial_no'] ?? null)) {
                throw ValidationException::withMessages([
                    'item_serial_no' => 'A serial number is required for serialized items.',
                ]);
            }

            $ticketNo = $this->nextNumber('SRV', $user->BC, TServiceReturn::class, 'ticket_no');
            $ticket = TServiceReturn::create([
                'ticket_no' => $ticketNo,
                'return_date' => $data['return_date'],
                'customer_nic' => $customer->NIC,
                'customer_code' => $customer->Code,
                'customer_name' => $customer->name,
                'customer_phone' => $customer->phone,
                'item_code' => $item->item_code,
                'item_serial_no' => $data['item_serial_no'] ?? null,
                'problem_description' => $data['problem_description'],
                'intake_condition' => $data['intake_condition'] ?? null,
                'is_warranty' => $data['is_warranty'] ?? false,
                'expected_completion_date' => $data['expected_completion_date'] ?? null,
                'status' => 'received',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $this->track(
                $ticket,
                'received',
                'Service item received and intake ticket created.',
                $user
            );

            return $this->freshTicket($ticket);
        });
    }

    public function updateTicket(TServiceReturn $ticket, array $data, User $user): TServiceReturn
    {
        return DB::transaction(function () use ($ticket, $data, $user) {
            $ticket = $this->lockTicket($ticket->id, $user);
            $this->assertStatus($ticket, ['received'], 'Only newly received tickets can be edited.');

            if (isset($data['customer_code'])) {
                $customer = Customer::query()
                    ->where('Code', $data['customer_code'])
                    ->where('BC', $user->BC)
                    ->firstOrFail();
                $ticket->customer_code = $customer->Code;
                $ticket->customer_nic = $customer->NIC;
                $ticket->customer_name = $customer->name;
                $ticket->customer_phone = $customer->phone;
            }

            if (isset($data['item_code'])) {
                $item = Item::query()
                    ->where('item_code', $data['item_code'])
                    ->where('BC', $user->BC)
                    ->firstOrFail();
                if ($item->is_serialized && blank($data['item_serial_no'] ?? $ticket->item_serial_no)) {
                    throw ValidationException::withMessages([
                        'item_serial_no' => 'A serial number is required for serialized items.',
                    ]);
                }
                $ticket->item_code = $item->item_code;
            }

            $ticket->fill(collect($data)->only([
                'return_date',
                'item_serial_no',
                'problem_description',
                'intake_condition',
                'is_warranty',
                'expected_completion_date',
            ])->all());
            $ticket->UID = $user->username;
            $ticket->save();

            $this->track($ticket, 'intake_updated', 'Service intake details updated.', $user);

            return $this->freshTicket($ticket);
        });
    }

    public function deleteTicket(TServiceReturn $ticket, User $user): void
    {
        DB::transaction(function () use ($ticket, $user) {
            $ticket = $this->lockTicket($ticket->id, $user);
            $this->assertStatus($ticket, ['received'], 'Only newly received tickets can be deleted.');
            $ticket->delete();
        });
    }

    public function dispatch(TServiceReturn $ticket, array $data, User $user): TServiceReturn
    {
        return DB::transaction(function () use ($ticket, $data, $user) {
            $ticket = $this->lockTicket($ticket->id, $user);
            $this->assertStatus($ticket, ['received'], 'Only received tickets can be dispatched.');
            $supplier = Supplier::query()
                ->where('Code', $data['supplier_code'])
                ->where('type', 'service')
                ->where('BC', $user->BC)
                ->firstOrFail();

            $dispatchNo = $this->nextNumber('SDP', $user->BC, TServiceDispatch::class, 'dispatch_no');
            TServiceDispatch::create([
                'dispatch_no' => $dispatchNo,
                'ticket_no' => $ticket->ticket_no,
                'supplier_code' => $supplier->Code,
                'dispatch_date' => $data['dispatch_date'],
                'estimated_return' => $data['estimated_return'] ?? null,
                'supplier_reference' => $data['supplier_reference'] ?? null,
                'dispatch_notes' => $data['dispatch_notes'] ?? null,
                'status' => 'dispatched',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $ticket->status = 'dispatched_to_supplier';
            $ticket->save();
            $this->track(
                $ticket,
                'dispatched_to_supplier',
                "Dispatched to {$supplier->name} under {$dispatchNo}.",
                $user
            );

            return $this->freshTicket($ticket);
        });
    }

    public function receiveBack(TServiceReturn $ticket, array $data, User $user): TServiceReturn
    {
        return DB::transaction(function () use ($ticket, $data, $user) {
            $ticket = $this->lockTicket($ticket->id, $user);
            $this->assertStatus(
                $ticket,
                ['dispatched_to_supplier'],
                'Only dispatched tickets can be received back.'
            );
            $dispatch = TServiceDispatch::query()
                ->where('ticket_no', $ticket->ticket_no)
                ->where('BC', $user->BC)
                ->where('status', 'dispatched')
                ->lockForUpdate()
                ->latest('id')
                ->firstOrFail();

            $repairCost = round((float) ($data['repair_cost'] ?? 0), 2);
            $dispatch->received_date = $data['received_date'];
            $dispatch->supplier_report = $data['supplier_report'] ?? null;
            $dispatch->repair_cost = $repairCost;
            $dispatch->payment_status = $repairCost <= 0 ? 'paid' : 'unpaid';
            $dispatch->status = 'received_back';
            $dispatch->save();

            if ($repairCost > 0) {
                $this->accountingService->postBalanced(
                    'SERVICE_SUPPLIER_COST',
                    $dispatch->dispatch_no,
                    $data['received_date'],
                    AccountingService::SERVICE_EXPENSE,
                    AccountingService::ACCOUNTS_PAYABLE,
                    $repairCost,
                    $user
                );
            }

            $ticket->status = 'received_from_supplier';
            $ticket->save();
            $this->track(
                $ticket,
                'received_from_supplier',
                "Received back under {$dispatch->dispatch_no}; supplier cost ".number_format($repairCost, 2).'.',
                $user
            );

            return $this->freshTicket($ticket);
        });
    }

    public function assignTechnician(TServiceReturn $ticket, array $data, User $user): TServiceReturn
    {
        return DB::transaction(function () use ($ticket, $data, $user) {
            $ticket = $this->lockTicket($ticket->id, $user);
            $this->assertStatus(
                $ticket,
                ['received', 'received_from_supplier'],
                'This ticket is not ready for technician assignment.'
            );

            $issueNo = $this->nextNumber('SIS', $user->BC, TServiceIssue::class, 'issue_no');
            TServiceIssue::create([
                'issue_no' => $issueNo,
                'ticket_no' => $ticket->ticket_no,
                'issue_date' => $data['issue_date'],
                'status' => 'assigned',
                'technician_name' => $data['technician_name'],
                'diagnosis' => $data['diagnosis'] ?? null,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $ticket->assigned_technician = $data['technician_name'];
            $ticket->status = 'under_repair';
            $ticket->save();
            $this->track(
                $ticket,
                'under_repair',
                "Assigned to technician {$data['technician_name']} under {$issueNo}.",
                $user
            );

            return $this->freshTicket($ticket);
        });
    }

    public function completeRepair(TServiceReturn $ticket, array $data, User $user): TServiceReturn
    {
        return DB::transaction(function () use ($ticket, $data, $user) {
            $ticket = $this->lockTicket($ticket->id, $user);
            $this->assertStatus($ticket, ['under_repair'], 'Only tickets under repair can be completed.');
            $issue = TServiceIssue::query()
                ->where('ticket_no', $ticket->ticket_no)
                ->where('BC', $user->BC)
                ->where('status', 'assigned')
                ->lockForUpdate()
                ->latest('id')
                ->firstOrFail();

            $issue->completed_date = $data['completed_date'];
            $issue->repair_details = $data['repair_details'];
            $issue->parts_used = $data['parts_used'] ?? null;
            $issue->labor_charge = $data['labor_charge'] ?? 0;
            $issue->status = 'completed';
            $issue->save();

            $ticket->repair_summary = $data['repair_details'];
            $ticket->status = 'repaired';
            $ticket->save();
            $this->track(
                $ticket,
                'repaired',
                "Repair completed by {$issue->technician_name}.",
                $user
            );

            return $this->freshTicket($ticket);
        });
    }

    public function createInvoice(TServiceReturn $ticket, array $data, User $user): TServiceReturn
    {
        return DB::transaction(function () use ($ticket, $data, $user) {
            $ticket = $this->lockTicket($ticket->id, $user);
            $this->assertStatus($ticket, ['repaired'], 'Only repaired tickets can be invoiced.');
            $supplierCost = (float) TServiceDispatch::query()
                ->where('ticket_no', $ticket->ticket_no)
                ->where('BC', $user->BC)
                ->sum('repair_cost');
            $serviceCharge = round((float) $data['service_charge'], 2);
            $netPayable = round($serviceCharge + $supplierCost, 2);

            if ($netPayable <= 0) {
                throw ValidationException::withMessages([
                    'service_charge' => 'The service invoice total must be greater than zero.',
                ]);
            }

            $invoiceNo = $this->nextNumber('SIV', $user->BC, TServiceInvoice::class, 'invoice_no');
            TServiceInvoice::create([
                'invoice_no' => $invoiceNo,
                'ticket_no' => $ticket->ticket_no,
                'invoice_date' => $data['invoice_date'],
                'service_charge' => $serviceCharge,
                'supplier_repair_cost' => $supplierCost,
                'net_payable' => $netPayable,
                'paid_amount' => 0,
                'payment_status' => 'unpaid',
                'invoice_note' => $data['invoice_note'] ?? null,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $this->accountingService->postBalanced(
                'SERVICE_INVOICE',
                $invoiceNo,
                $data['invoice_date'],
                AccountingService::ACCOUNTS_RECEIVABLE,
                AccountingService::SERVICE_INCOME,
                $netPayable,
                $user
            );

            $ticket->status = 'invoiced';
            $ticket->save();
            $this->track(
                $ticket,
                'invoiced',
                "Service invoice {$invoiceNo} created for ".number_format($netPayable, 2).'.',
                $user
            );

            return $this->freshTicket($ticket);
        });
    }

    public function customerPayment(TServiceReturn $ticket, array $data, User $user): TServiceReturn
    {
        return DB::transaction(function () use ($ticket, $data, $user) {
            $ticket = $this->lockTicket($ticket->id, $user);
            $this->assertStatus(
                $ticket,
                ['invoiced', 'customer_paid'],
                'Customer payments require an active service invoice.'
            );
            $invoice = TServiceInvoice::query()
                ->where('ticket_no', $ticket->ticket_no)
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->firstOrFail();
            $amount = round((float) $data['amount'], 2);
            $outstanding = round((float) $invoice->net_payable - (float) $invoice->paid_amount, 2);

            if ($amount > $outstanding + 0.009) {
                throw ValidationException::withMessages([
                    'amount' => "Only {$outstanding} remains outstanding on {$invoice->invoice_no}.",
                ]);
            }

            $bank = $this->optionalBank($data, $user->BC);
            $paymentNo = $this->nextNumber('SCP', $user->BC, TServiceCustomerPayment::class, 'payment_no');
            TServiceCustomerPayment::create([
                'payment_no' => $paymentNo,
                'invoice_no' => $invoice->invoice_no,
                'payment_date' => $data['payment_date'],
                'amount' => $amount,
                'payment_method' => $data['payment_method'],
                'bank_detail_id' => $bank?->id,
                'payment_note' => $data['payment_note'] ?? null,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $invoice->paid_amount = round((float) $invoice->paid_amount + $amount, 2);
            $remaining = round((float) $invoice->net_payable - (float) $invoice->paid_amount, 2);
            $invoice->payment_status = $remaining <= 0.009 ? 'paid' : 'partial';
            $invoice->save();

            $this->accountingService->postBalanced(
                'SERVICE_CUSTOMER_PAYMENT',
                $paymentNo,
                $data['payment_date'],
                $data['payment_method'] === 'cash'
                    ? AccountingService::CASH
                    : AccountingService::BANK,
                AccountingService::ACCOUNTS_RECEIVABLE,
                $amount,
                $user
            );

            if ($invoice->payment_status === 'paid') {
                $ticket->status = 'customer_paid';
                $ticket->save();
            }
            $this->track(
                $ticket,
                'customer_payment',
                "Customer payment {$paymentNo} posted for ".number_format($amount, 2).'.',
                $user
            );
            $this->completeWhenSettled($ticket, $data['payment_date'], $user);

            return $this->freshTicket($ticket);
        });
    }

    public function supplierPayment(TServiceReturn $ticket, array $data, User $user): TServiceReturn
    {
        return DB::transaction(function () use ($ticket, $data, $user) {
            $ticket = $this->lockTicket($ticket->id, $user);
            $this->assertStatus(
                $ticket,
                ['received_from_supplier', 'under_repair', 'repaired', 'invoiced', 'customer_paid'],
                'This ticket has no payable supplier repair ready for settlement.'
            );
            $dispatch = TServiceDispatch::query()
                ->where('ticket_no', $ticket->ticket_no)
                ->where('BC', $user->BC)
                ->where('status', 'received_back')
                ->lockForUpdate()
                ->latest('id')
                ->firstOrFail();
            $amount = round((float) $data['amount'], 2);
            $outstanding = round((float) $dispatch->repair_cost - (float) $dispatch->paid_amount, 2);

            if ($outstanding <= 0.009 || $amount > $outstanding + 0.009) {
                throw ValidationException::withMessages([
                    'amount' => $outstanding <= 0.009
                        ? 'This supplier repair is already settled.'
                        : "Only {$outstanding} remains outstanding on {$dispatch->dispatch_no}.",
                ]);
            }

            $bank = $this->optionalBank($data, $user->BC);
            $paymentNo = $this->nextNumber('SSP', $user->BC, TServiceSupplierPayment::class, 'payment_no');
            TServiceSupplierPayment::create([
                'payment_no' => $paymentNo,
                'dispatch_no' => $dispatch->dispatch_no,
                'payment_date' => $data['payment_date'],
                'amount' => $amount,
                'payment_method' => $data['payment_method'],
                'bank_detail_id' => $bank?->id,
                'payment_note' => $data['payment_note'] ?? null,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $dispatch->paid_amount = round((float) $dispatch->paid_amount + $amount, 2);
            $remaining = round((float) $dispatch->repair_cost - (float) $dispatch->paid_amount, 2);
            $dispatch->payment_status = $remaining <= 0.009 ? 'paid' : 'partial';
            $dispatch->save();

            $this->accountingService->postBalanced(
                'SERVICE_SUPPLIER_PAYMENT',
                $paymentNo,
                $data['payment_date'],
                AccountingService::ACCOUNTS_PAYABLE,
                $data['payment_method'] === 'cash'
                    ? AccountingService::CASH
                    : AccountingService::BANK,
                $amount,
                $user
            );
            $this->track(
                $ticket,
                'supplier_payment',
                "Supplier payment {$paymentNo} posted for ".number_format($amount, 2).'.',
                $user
            );
            $this->completeWhenSettled($ticket, $data['payment_date'], $user);

            return $this->freshTicket($ticket);
        });
    }

    private function completeWhenSettled(TServiceReturn $ticket, string $date, User $user): void
    {
        $invoice = TServiceInvoice::query()
            ->where('ticket_no', $ticket->ticket_no)
            ->where('BC', $user->BC)
            ->first();
        $supplierOutstanding = (float) TServiceDispatch::query()
            ->where('ticket_no', $ticket->ticket_no)
            ->where('BC', $user->BC)
            ->selectRaw('COALESCE(SUM(repair_cost - paid_amount), 0) as outstanding')
            ->value('outstanding');

        if ($invoice?->payment_status === 'paid' && $supplierOutstanding <= 0.009) {
            $ticket->status = 'completed';
            $ticket->completed_date = $date;
            $ticket->save();
            $this->track(
                $ticket,
                'completed',
                'Customer item released and service ticket completed.',
                $user
            );
        }
    }

    private function optionalBank(array $data, string $branchCode): ?BankDetail
    {
        if (($data['payment_method'] ?? 'cash') === 'cash') {
            return null;
        }

        return BankDetail::query()
            ->whereKey($data['bank_detail_id'] ?? null)
            ->where('BC', $branchCode)
            ->firstOrFail();
    }

    private function track(
        TServiceReturn $ticket,
        string $event,
        string $description,
        User $user
    ): void {
        TServiceItemTrack::create([
            'ticket_no' => $ticket->ticket_no,
            'event_name' => $event,
            'description' => $description,
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);
    }

    private function lockTicket(int $id, User $user): TServiceReturn
    {
        return TServiceReturn::query()
            ->whereKey($id)
            ->where('BC', $user->BC)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function assertStatus(TServiceReturn $ticket, array $allowed, string $message): void
    {
        if (! in_array($ticket->status, $allowed, true)) {
            throw ValidationException::withMessages(['status' => $message]);
        }
    }

    private function freshTicket(TServiceReturn $ticket): TServiceReturn
    {
        return $ticket->fresh($this->relations());
    }

    private function relations(): array
    {
        return [
            'customer',
            'item',
            'dispatches.supplier',
            'dispatches.payments.bankAccount',
            'issues',
            'invoices.payments.bankAccount',
            'tracks',
        ];
    }

    private function nextNumber(
        string $prefix,
        string $branchCode,
        string $modelClass,
        string $column
    ): string {
        $date = now()->format('Ymd');
        $base = "{$prefix}-{$branchCode}-{$date}-";
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
