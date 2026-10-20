<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Item;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ItemController extends GeneratedCodeCrudController
{
    protected function modelClass(): string
    {
        return Item::class;
    }

    protected function resourceName(): string
    {
        return 'item';
    }

    protected function codeField(): string
    {
        return 'item_code';
    }

    protected function codePrefix(): string
    {
        return 'ITM';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'item_description' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:200',
            ],
            'category_id' => [
                'nullable',
                'integer',
                Rule::exists('categories', 'id')
                    ->where('BC', $this->branchCode()),
            ],
            'brand_id' => [
                'nullable',
                'integer',
                Rule::exists('m_brands', 'id')
                    ->where('BC', $this->branchCode()),
            ],
            'make_id' => [
                'nullable',
                'integer',
                Rule::exists('m__makes', 'id')
                    ->where('BC', $this->branchCode()),
            ],
            'color_id' => [
                'nullable',
                'integer',
                Rule::exists('m_colors', 'id')
                    ->where('BC', $this->branchCode()),
            ],
            'is_batch' => ['sometimes', 'boolean'],
            'default_batch_price_mode' => ['nullable', Rule::in(['batch', 'average', 'last'])],
            'is_serialized' => ['sometimes', 'boolean'],
            'reorder_level' => ['sometimes', 'integer', 'min:0'],
            'sales_criteria_enabled' => ['sometimes', 'boolean'],
            'min_sales_qty' => ['nullable', 'integer', 'min:1'],
            'max_sales_qty' => ['nullable', 'integer', 'min:1'],
            'min_sales_price' => ['nullable', 'numeric', 'min:0'],
            'max_sales_price' => ['nullable', 'numeric', 'min:0'],
            'standard_purchase_price' => ['nullable', 'numeric', 'min:0'],
            'standard_sales_price' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    protected function relationships(): array
    {
        return ['category', 'brand', 'make', 'color'];
    }

    protected function searchableColumns(): array
    {
        return ['item_code', 'item_description'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'item_code';
    }

    protected function defaultOrderDirection(): string
    {
        return 'asc';
    }

    protected function prepareValidatedData(
        array $validated,
        ?Model $model = null
    ): array {
        $isBatch = array_key_exists('is_batch', $validated)
            ? (bool) $validated['is_batch']
            : (bool) $model?->getAttribute('is_batch');

        if ($isBatch) {
            $validated['standard_purchase_price'] = 0;
            $validated['standard_sales_price'] = 0;
            $validated['default_batch_price_mode'] = $validated['default_batch_price_mode']
                ?? $model?->getAttribute('default_batch_price_mode')
                ?? 'batch';
        } else {
            $purchasePrice = $validated['standard_purchase_price']
                ?? $model?->getAttribute('standard_purchase_price');
            $salesPrice = $validated['standard_sales_price']
                ?? $model?->getAttribute('standard_sales_price');
            $validated['default_batch_price_mode'] = 'batch';

            if ((float) $purchasePrice <= 0 || (float) $salesPrice <= 0) {
                throw ValidationException::withMessages([
                    'standard_purchase_price' => 'Purchase and sales prices must be greater than zero for non-batch items.',
                ]);
            }
        }

        $criteriaEnabled = array_key_exists('sales_criteria_enabled', $validated)
            ? (bool) $validated['sales_criteria_enabled']
            : (bool) $model?->getAttribute('sales_criteria_enabled');

        if (! $criteriaEnabled) {
            $validated['sales_criteria_enabled'] = false;
            $validated['min_sales_qty'] = null;
            $validated['max_sales_qty'] = null;
            $validated['min_sales_price'] = null;
            $validated['max_sales_price'] = null;
        } else {
            $validated['sales_criteria_enabled'] = true;

            $minimumQty = $validated['min_sales_qty'] ?? $model?->getAttribute('min_sales_qty');
            $maximumQty = $validated['max_sales_qty'] ?? $model?->getAttribute('max_sales_qty');
            $minimumPrice = $validated['min_sales_price'] ?? $model?->getAttribute('min_sales_price');
            $maximumPrice = $validated['max_sales_price'] ?? $model?->getAttribute('max_sales_price');

            if (
                ! $minimumQty &&
                ! $maximumQty &&
                ! $minimumPrice &&
                ! $maximumPrice
            ) {
                throw ValidationException::withMessages([
                    'min_sales_qty' => 'Enter at least one sales quantity or sales price criterion when sales criteria are enabled.',
                ]);
            }

            if ($minimumQty && $maximumQty && (int) $maximumQty < (int) $minimumQty) {
                throw ValidationException::withMessages([
                    'max_sales_qty' => 'Maximum sales quantity cannot be less than minimum sales quantity.',
                ]);
            }

            if ($minimumPrice && $maximumPrice && (float) $maximumPrice < (float) $minimumPrice) {
                throw ValidationException::withMessages([
                    'max_sales_price' => 'Maximum sales price cannot be less than minimum sales price.',
                ]);
            }
        }

        return parent::prepareValidatedData($validated, $model);
    }

    protected function beforeDelete(Model $model): ?JsonResponse
    {
        if ($model->batches()->exists() || $model->movements()->exists()) {
            return $this->errorResponse(
                'This item has stock history and cannot be deleted.',
                422
            );
        }

        return null;
    }
}
