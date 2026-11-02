<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\MRoute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;

class RouteController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return MRoute::class;
    }

    protected function resourceName(): string
    {
        return 'route';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'name' => [$model ? 'sometimes' : 'required', 'string', 'max:100'],
            'area_id' => [
                $model ? 'sometimes' : 'required',
                'integer',
                Rule::exists('m_areas', 'id')
                    ->where('BC', $this->branchCode()),
            ],
        ];
    }

    protected function relationships(): array
    {
        return ['area'];
    }

    protected function searchableColumns(): array
    {
        return ['name'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'name';
    }
}
