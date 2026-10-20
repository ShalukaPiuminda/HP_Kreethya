<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\SalesReturnReason;
use Illuminate\Database\Eloquent\Model;

class SalesReturnReasonController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return SalesReturnReason::class;
    }

    protected function resourceName(): string
    {
        return 'sales return reason';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'reason' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:255',
            ],
        ];
    }

    protected function searchableColumns(): array
    {
        return ['reason'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'reason';
    }
}
