<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Brand;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;

class BrandController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return Brand::class;
    }

    protected function resourceName(): string
    {
        return 'brand';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'name' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:50',
                Rule::unique('m_brands', 'name')
                    ->where('BC', $this->branchCode())
                    ->ignore($model?->getKey()),
            ],
        ];
    }

    protected function defaultOrderColumn(): string
    {
        return 'name';
    }
}
