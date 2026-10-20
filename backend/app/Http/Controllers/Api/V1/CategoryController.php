<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Category;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CategoryController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return Category::class;
    }

    protected function resourceName(): string
    {
        return 'category';
    }

    protected function rules(?Model $model = null): array
    {
        $parentId = request()->input(
            'parent_id',
            $model?->getAttribute('parent_id')
        );

        return [
            'name' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:50',
                Rule::unique('categories', 'name')
                    ->where('BC', $this->branchCode())
                    ->where(function ($query) use ($parentId) {
                        if ($parentId === null || $parentId === '') {
                            $query->whereNull('parent_id');
                        } else {
                            $query->where('parent_id', $parentId);
                        }
                    })
                    ->ignore($model?->getKey()),
            ],
            'parent_id' => [
                'nullable',
                'integer',
                Rule::exists('categories', 'id')
                    ->where('BC', $this->branchCode()),
                Rule::notIn(array_filter([$model?->getKey()])),
            ],
        ];
    }

    protected function relationships(): array
    {
        return ['parent'];
    }

    protected function relationshipCounts(): array
    {
        return ['children', 'items'];
    }

    protected function searchableColumns(): array
    {
        return ['name'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'name';
    }

    protected function prepareValidatedData(
        array $validated,
        ?Model $model = null
    ): array {
        if ($model && array_key_exists('parent_id', $validated)) {
            $this->ensureParentIsNotDescendant(
                $model,
                $validated['parent_id']
            );
        }

        return parent::prepareValidatedData($validated, $model);
    }

    protected function beforeDelete(Model $model): ?JsonResponse
    {
        if ($model->children()->exists()) {
            return $this->errorResponse(
                'Move or delete the subcategories before deleting this category.',
                422
            );
        }

        if ($model->items()->exists()) {
            return $this->errorResponse(
                'This category is assigned to items and cannot be deleted.',
                422
            );
        }

        return null;
    }

    private function ensureParentIsNotDescendant(
        Model $category,
        int|string|null $parentId
    ): void {
        if (! $parentId) {
            return;
        }

        $parent = Category::query()
            ->where('BC', $this->branchCode())
            ->find($parentId);

        while ($parent) {
            if ($parent->id === $category->id) {
                throw ValidationException::withMessages([
                    'parent_id' => 'A category cannot be moved below one of its own subcategories.',
                ]);
            }

            $parent = $parent->parent_id
                ? Category::query()
                    ->where('BC', $this->branchCode())
                    ->find($parent->parent_id)
                : null;
        }
    }
}
