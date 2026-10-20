<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Make;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;

class MakeController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return Make::class;
    }

    protected function resourceName(): string
    {
        return 'make';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'name' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:50',
                Rule::unique('m__makes', 'name')
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
