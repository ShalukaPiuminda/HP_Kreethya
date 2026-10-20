<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\MArea;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class AreaController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return MArea::class;
    }

    protected function resourceName(): string
    {
        return 'area';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'name' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:100',
                Rule::unique('m_areas', 'name')->ignore($model?->getKey()),
            ],
        ];
    }

    protected function relationshipCounts(): array
    {
        return ['routes'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'name';
    }

    protected function beforeDelete(Model $model): ?JsonResponse
    {
        if ($model->routes()->exists()) {
            return $this->errorResponse(
                'Move or delete the routes in this area before deleting it.',
                422
            );
        }

        return null;
    }
}
