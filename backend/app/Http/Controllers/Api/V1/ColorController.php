<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Color;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;

class ColorController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return Color::class;
    }

    protected function resourceName(): string
    {
        return 'color';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'name' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:50',
                Rule::unique('m_colors', 'name')
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
