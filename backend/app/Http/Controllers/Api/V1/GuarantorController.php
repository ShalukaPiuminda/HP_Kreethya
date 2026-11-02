<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\MGuarantor;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;

class GuarantorController extends GeneratedCodeCrudController
{
    protected function modelClass(): string
    {
        return MGuarantor::class;
    }

    protected function resourceName(): string
    {
        return 'guarantor';
    }

    protected function codeField(): string
    {
        return 'Code';
    }

    protected function codePrefix(): string
    {
        return 'GUA';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'name' => [$model ? 'sometimes' : 'required', 'string', 'max:100'],
            'NIC' => [
                ...$this->nicRules($model === null),
                Rule::unique('m_guarantors', 'NIC')->ignore($model?->getKey()),
            ],
            'phone' => $this->phoneRules(),
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
