<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Customer;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;

class CustomerController extends GeneratedCodeCrudController
{
    protected function modelClass(): string
    {
        return Customer::class;
    }

    protected function resourceName(): string
    {
        return 'customer';
    }

    protected function codeField(): string
    {
        return 'Code';
    }

    protected function codePrefix(): string
    {
        return 'CUST';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'name' => [$model ? 'sometimes' : 'required', 'string', 'max:100'],
            'NIC' => [
                ...$this->nicRules($model === null),
                Rule::unique('customers', 'NIC')->ignore($model?->getKey()),
            ],
            'phone' => $this->mobilePhoneRules(),
            'address' => ['nullable', 'string'],
        ];
    }

    protected function searchableColumns(): array
    {
        return ['Code', 'name', 'NIC', 'phone'];
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
