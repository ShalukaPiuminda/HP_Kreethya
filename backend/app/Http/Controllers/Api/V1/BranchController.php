<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\BranchDel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;

class BranchController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return BranchDel::class;
    }

    protected function resourceName(): string
    {
        return 'branch';
    }

    protected function branchScoped(): bool
    {
        return false;
    }

    protected function relationships(): array
    {
        return ['company'];
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'company_id' => ['nullable', 'integer', Rule::exists('companies', 'id')],
            'bccode' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:10',
                Rule::unique('branch_dels', 'bccode')->ignore($model?->getKey()),
            ],
            'name' => [$model ? 'sometimes' : 'required', 'string', 'max:100'],
            'phone' => $this->phoneRules(),
            'address' => ['nullable', 'string'],
            'is_active' => ['sometimes', Rule::in(['true', 'false', '1', '0', true, false, 1, 0])],
        ];
    }

    protected function prepareValidatedData(array $validated, ?Model $model = null): array
    {
        if (array_key_exists('is_active', $validated)) {
            $validated['is_active'] = filter_var($validated['is_active'], FILTER_VALIDATE_BOOLEAN);
        }

        return parent::prepareValidatedData($validated, $model);
    }

    protected function searchableColumns(): array
    {
        return ['bccode', 'name', 'phone'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'bccode';
    }
}
