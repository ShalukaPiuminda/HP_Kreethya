<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Store;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;

class StoreController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return Store::class;
    }

    protected function resourceName(): string
    {
        return 'store';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'name' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:50',
                Rule::unique('stores', 'name')
                    ->where('BC', $this->branchCode())
                    ->ignore($model?->getKey()),
            ],
            'location' => ['nullable', 'string', 'max:100'],
        ];
    }

    protected function searchableColumns(): array
    {
        return ['name', 'location'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'name';
    }

    protected function beforeDelete(Model $model): ?JsonResponse
    {
        if ($model->batches()->exists() || $model->movements()->exists()) {
            return $this->errorResponse(
                'This store has stock history and cannot be deleted.',
                422
            );
        }

        return null;
    }
}
