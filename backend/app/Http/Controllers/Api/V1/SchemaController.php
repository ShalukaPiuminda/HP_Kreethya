<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\MSchema;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;

class SchemaController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return MSchema::class;
    }

    protected function resourceName(): string
    {
        return 'hire purchase scheme';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'SchemaType' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:50',
                Rule::unique('m_schemas', 'SchemaType')
                    ->ignore($model?->getKey()),
            ],
            'DownpaymentPrecentage' => [
                $model ? 'sometimes' : 'required',
                'numeric',
                'min:0',
                'max:100',
            ],
            'InstallmentRate' => [
                $model ? 'sometimes' : 'required',
                'numeric',
                'min:0',
                'max:100',
            ],
            'NoOfInstallment' => [
                $model ? 'sometimes' : 'required',
                'integer',
                'min:1',
            ],
            'DocumentCharagePrecentage' => [
                $model ? 'sometimes' : 'required',
                'numeric',
                'min:0',
                'max:100',
            ],
            'PanaltyCharage' => [
                $model ? 'sometimes' : 'required',
                'numeric',
                'min:0',
                'max:100',
            ],
            'GracePeriodDays' => ['sometimes', 'integer', 'min:0'],
        ];
    }

    protected function searchableColumns(): array
    {
        return ['SchemaType'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'SchemaType';
    }
}
