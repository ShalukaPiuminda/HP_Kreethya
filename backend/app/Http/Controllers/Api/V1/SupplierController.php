<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\TPurchaseOrderSum;
use App\Models\TServiceDispatch;
use App\Models\Supplier;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\ValidationException;

class SupplierController extends GeneratedCodeCrudController
{
    protected function modelClass(): string
    {
        return Supplier::class;
    }

    protected function resourceName(): string
    {
        return 'supplier';
    }

    protected function codeField(): string
    {
        return 'Code';
    }

    protected function codePrefix(): string
    {
        return 'SUP';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'name' => [$model ? 'sometimes' : 'required', 'string', 'max:100'],
            'phone' => $this->phoneRules(),
            'address' => ['nullable', 'string'],
            'type' => [$model ? 'sometimes' : 'required', 'in:normal,service'],
        ];
    }

    protected function prepareValidatedData(array $validated, ?Model $model = null): array
    {
        if ($model instanceof Supplier && array_key_exists('type', $validated) && $validated['type'] !== $model->type) {
            $references = [];

            $pendingPurchaseOrders = TPurchaseOrderSum::query()
                ->where('supplier_code', $model->Code)
                ->where('BC', $this->branchCode())
                ->whereIn('status', ['draft', 'approved', 'partially_received'])
                ->orderBy('po_no')
                ->get(['po_no', 'status']);

            foreach ($pendingPurchaseOrders as $purchaseOrder) {
                $references[] = sprintf(
                    'Pending purchase order %s (%s)',
                    $purchaseOrder->po_no,
                    $purchaseOrder->status
                );
            }

            $pendingServiceDispatches = TServiceDispatch::query()
                ->where('supplier_code', $model->Code)
                ->where('BC', $this->branchCode())
                ->where('status', 'dispatched')
                ->orderBy('dispatch_no')
                ->get(['dispatch_no', 'ticket_no', 'status']);

            foreach ($pendingServiceDispatches as $dispatch) {
                $reference = sprintf(
                    'Pending service dispatch %s',
                    $dispatch->dispatch_no
                );

                if (! empty($dispatch->ticket_no)) {
                    $reference .= sprintf(' (ticket %s)', $dispatch->ticket_no);
                }

                $reference .= sprintf(' (%s)', $dispatch->status);
                $references[] = $reference;
            }

            if ($references !== []) {
                throw ValidationException::withMessages([
                    'type' => array_merge(
                        ['Supplier type cannot be changed while linked orders or service jobs are still open.'],
                        $references
                    ),
                ]);
            }
        }

        return parent::prepareValidatedData($validated, $model);
    }

    protected function searchableColumns(): array
    {
        return ['Code', 'name', 'phone', 'type'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'Code';
    }

    protected function defaultOrderDirection(): string
    {
        return 'asc';
    }
}
