<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\TServiceReturn;
use App\Services\ServiceTicketService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ServiceTicketController extends BaseController
{
    public function __construct(private readonly ServiceTicketService $serviceTicketService)
    {
    }

    public function index(Request $request)
    {
        $filters = $request->validate([
            'status' => ['nullable', 'string', 'max:40'],
            'search' => ['nullable', 'string', 'max:100'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        return $this->paginatedResponse(
            $this->serviceTicketService->tickets($filters, $request->user()->BC),
            'Service tickets retrieved successfully.'
        );
    }

    public function options(Request $request)
    {
        return $this->successResponse(
            $this->serviceTicketService->options($request->user()->BC),
            'Service options retrieved successfully.'
        );
    }

    public function summary(Request $request)
    {
        return $this->successResponse(
            $this->serviceTicketService->summary($request->user()->BC),
            'Service summary retrieved successfully.'
        );
    }

    public function store(Request $request)
    {
        $ticket = $this->serviceTicketService->createTicket(
            $this->validateTicket($request),
            $request->user()
        );

        return $this->successResponse($ticket, 'Service ticket created successfully.', 201);
    }

    public function show(Request $request, int $serviceTicket)
    {
        $ticket = TServiceReturn::query()
            ->whereKey($serviceTicket)
            ->where('BC', $request->user()->BC)
            ->with([
                'customer',
                'item',
                'dispatches.supplier',
                'dispatches.payments.bankAccount',
                'issues',
                'invoices.payments.bankAccount',
                'tracks',
            ])
            ->firstOrFail();

        return $this->successResponse($ticket);
    }

    public function update(Request $request, int $serviceTicket)
    {
        $ticket = $this->branchTicket($request, $serviceTicket);

        return $this->successResponse(
            $this->serviceTicketService->updateTicket(
                $ticket,
                $this->validateTicket($request, true),
                $request->user()
            ),
            'Service ticket updated successfully.'
        );
    }

    public function destroy(Request $request, int $serviceTicket)
    {
        $this->serviceTicketService->deleteTicket(
            $this->branchTicket($request, $serviceTicket),
            $request->user()
        );

        return $this->successResponse(null, 'Service ticket deleted successfully.');
    }

    public function dispatch(Request $request, int $serviceTicket)
    {
        $validated = $request->validate([
            'supplier_code' => [
                'required',
                'string',
                Rule::exists('suppliers', 'Code')
                    ->where('BC', $request->user()->BC)
                    ->where('type', 'service'),
            ],
            'dispatch_date' => ['required', 'date'],
            'estimated_return' => ['nullable', 'date', 'after_or_equal:dispatch_date'],
            'supplier_reference' => ['nullable', 'string', 'max:100'],
            'dispatch_notes' => ['nullable', 'string', 'max:2000'],
        ]);

        return $this->successResponse(
            $this->serviceTicketService->dispatch(
                $this->branchTicket($request, $serviceTicket),
                $validated,
                $request->user()
            ),
            'Service item dispatched to supplier.'
        );
    }

    public function receiveBack(Request $request, int $serviceTicket)
    {
        $validated = $request->validate([
            'received_date' => ['required', 'date'],
            'supplier_report' => ['nullable', 'string', 'max:3000'],
            'repair_cost' => ['nullable', 'numeric', 'min:0'],
        ]);

        return $this->successResponse(
            $this->serviceTicketService->receiveBack(
                $this->branchTicket($request, $serviceTicket),
                $validated,
                $request->user()
            ),
            'Service item received back from supplier.'
        );
    }

    public function assignTechnician(Request $request, int $serviceTicket)
    {
        $validated = $request->validate([
            'issue_date' => ['required', 'date'],
            'technician_name' => ['required', 'string', 'max:100'],
            'diagnosis' => ['nullable', 'string', 'max:3000'],
        ]);

        return $this->successResponse(
            $this->serviceTicketService->assignTechnician(
                $this->branchTicket($request, $serviceTicket),
                $validated,
                $request->user()
            ),
            'Service item assigned to technician.'
        );
    }

    public function completeRepair(Request $request, int $serviceTicket)
    {
        $validated = $request->validate([
            'completed_date' => ['required', 'date'],
            'repair_details' => ['required', 'string', 'max:5000'],
            'parts_used' => ['nullable', 'string', 'max:3000'],
            'labor_charge' => ['nullable', 'numeric', 'min:0'],
        ]);

        return $this->successResponse(
            $this->serviceTicketService->completeRepair(
                $this->branchTicket($request, $serviceTicket),
                $validated,
                $request->user()
            ),
            'Repair work completed successfully.'
        );
    }

    public function invoice(Request $request, int $serviceTicket)
    {
        $validated = $request->validate([
            'invoice_date' => ['required', 'date'],
            'service_charge' => ['required', 'numeric', 'min:0'],
            'invoice_note' => ['nullable', 'string', 'max:3000'],
        ]);

        return $this->successResponse(
            $this->serviceTicketService->createInvoice(
                $this->branchTicket($request, $serviceTicket),
                $validated,
                $request->user()
            ),
            'Service invoice created successfully.'
        );
    }

    public function customerPayment(Request $request, int $serviceTicket)
    {
        $validated = $this->validatePayment($request, ['cash', 'card', 'bank_transfer']);

        return $this->successResponse(
            $this->serviceTicketService->customerPayment(
                $this->branchTicket($request, $serviceTicket),
                $validated,
                $request->user()
            ),
            'Service customer payment posted successfully.'
        );
    }

    public function supplierPayment(Request $request, int $serviceTicket)
    {
        $validated = $this->validatePayment($request, ['cash', 'bank_transfer']);

        return $this->successResponse(
            $this->serviceTicketService->supplierPayment(
                $this->branchTicket($request, $serviceTicket),
                $validated,
                $request->user()
            ),
            'Service supplier payment posted successfully.'
        );
    }

    private function validateTicket(Request $request, bool $update = false): array
    {
        $required = $update ? 'sometimes' : 'required';

        return $request->validate([
            'return_date' => [$required, 'date'],
            'customer_code' => [
                $required,
                'string',
                Rule::exists('customers', 'Code')->where('BC', $request->user()->BC),
            ],
            'item_code' => [
                $required,
                'string',
                Rule::exists('items', 'item_code')->where('BC', $request->user()->BC),
            ],
            'item_serial_no' => ['nullable', 'string', 'max:100'],
            'problem_description' => [$required, 'string', 'max:5000'],
            'intake_condition' => ['nullable', 'string', 'max:3000'],
            'is_warranty' => ['nullable', 'boolean'],
            'expected_completion_date' => ['nullable', 'date', 'after_or_equal:return_date'],
        ]);
    }

    private function validatePayment(Request $request, array $methods): array
    {
        return $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', Rule::in($methods)],
            'bank_detail_id' => [
                'nullable',
                'required_unless:payment_method,cash',
                'integer',
                Rule::exists('bank_details', 'id')->where('BC', $request->user()->BC),
            ],
            'payment_note' => ['nullable', 'string', 'max:2000'],
        ]);
    }

    private function branchTicket(Request $request, int $id): TServiceReturn
    {
        return TServiceReturn::query()
            ->whereKey($id)
            ->where('BC', $request->user()->BC)
            ->firstOrFail();
    }
}
