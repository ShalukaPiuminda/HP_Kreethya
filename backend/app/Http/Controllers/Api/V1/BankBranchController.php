<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\BankBranch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;

class BankBranchController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return BankBranch::class;
    }

    protected function resourceName(): string
    {
        return 'bank branch';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'bank_id' => [
                $model ? 'sometimes' : 'required',
                'integer',
                Rule::exists('bank_details', 'id')
                    ->where('BC', $this->branchCode()),
            ],
            'branch_name' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:100',
            ],
            'branch_code' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:10',
                Rule::unique('bank_branches', 'branch_code')
                    ->where('BC', $this->branchCode())
                    ->where(
                        'bank_id',
                        request()->input('bank_id', $model?->getAttribute('bank_id'))
                    )
                    ->ignore($model?->getKey()),
            ],
        ];
    }

    protected function relationships(): array
    {
        return ['bank'];
    }

    protected function searchableColumns(): array
    {
        return ['branch_name', 'branch_code'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'branch_name';
    }
}
