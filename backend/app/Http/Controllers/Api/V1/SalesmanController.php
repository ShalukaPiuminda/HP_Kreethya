<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\MSalesman;
use Illuminate\Database\Eloquent\Model;

class SalesmanController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return MSalesman::class;
    }

    protected function resourceName(): string
    {
        return 'salesperson';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'name' => [$model ? 'sometimes' : 'required', 'string', 'max:100'],
            'phone' => $this->phoneRules(),
        ];
    }

    protected function searchableColumns(): array
    {
        return ['name', 'phone'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'name';
    }
}
