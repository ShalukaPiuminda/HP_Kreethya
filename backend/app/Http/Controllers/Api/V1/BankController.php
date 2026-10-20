<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\BankDetail;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class BankController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return BankDetail::class;
    }

    protected function resourceName(): string
    {
        return 'bank account';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'bank_name' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:100',
            ],
            'account_no' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:50',
                Rule::unique('bank_details', 'account_no')
                    ->where('BC', $this->branchCode())
                    ->ignore($model?->getKey()),
            ],
        ];
    }

    protected function relationshipCounts(): array
    {
        return ['branches'];
    }

    protected function searchableColumns(): array
    {
        return ['bank_name', 'account_no'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'bank_name';
    }

    protected function beforeDelete(Model $model): ?JsonResponse
    {
        if ($model->branches()->exists()) {
            return $this->errorResponse(
                'Delete the branches linked to this bank account first.',
                422
            );
        }

        return null;
    }
}
