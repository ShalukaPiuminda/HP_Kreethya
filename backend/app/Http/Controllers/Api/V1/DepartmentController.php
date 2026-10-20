<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Department;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;

class DepartmentController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return Department::class;
    }

    protected function resourceName(): string
    {
        return 'department';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'name' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:50',
                Rule::unique('departments', 'name')
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
