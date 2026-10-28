<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Item;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
            'barcode' => [
                'nullable',
                'string',
                'max:50',
                'regex:/^[\x21-\x7E]+$/',
                function (string $attribute, mixed $value, callable $fail) use ($model): void {
                    $this->validateBarcode((string) $value, $model, $fail);
                },
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
            'warranty_enabled' => ['sometimes', 'boolean'],
            'warranty_months' => ['nullable', 'integer', 'min:1', 'max:120'],
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
        return ['item_code', 'item_description', 'barcode'];
    }

    public function store(Request $request): JsonResponse
    {
        $this->normalizeBarcodeInput($request);

        try {
            return parent::store($request);
        } catch (QueryException $exception) {
            return $this->duplicateBarcodeResponse($exception);
        }
    }

    public function update(Request $request, int|string $id): JsonResponse
    {
        $this->normalizeBarcodeInput($request);

        try {
            return parent::update($request, $id);
        } catch (QueryException $exception) {
            return $this->duplicateBarcodeResponse($exception);
        }
    }

    /**
     * Strips scanner suffixes/control characters and trims, so validation and
     * uniqueness run against the value that is actually stored. Blank becomes null.
     */
    private function normalizeBarcodeInput(Request $request): void
    {
        if (! $request->exists('barcode')) {
            return;
        }

        $value = $request->input('barcode');

        if (is_string($value)) {
            $value = trim(preg_replace('/[\x00-\x1F\x7F]+/', '', $value) ?? '');
            $request->merge(['barcode' => $value === '' ? null : $value]);
        }
    }

    private function validateBarcode(string $barcode, ?Model $model, callable $fail): void
    {
        // 8-digit codes are not checked: UPC-E uses a different check-digit rule than EAN-8,
        // and scanners already verify the check digit when they read a symbol.
        if (
            ctype_digit($barcode) &&
            in_array(strlen($barcode), [12, 13, 14], true) &&
            ! $this->hasValidGs1CheckDigit($barcode)
        ) {
            $fail('The barcode check digit is not valid for a '.strlen($barcode).'-digit EAN/UPC code.');

            return;
        }

        $existing = Item::query()
            ->where('BC', $this->branchCode())
            ->whereIn('barcode', $this->barcodeVariants($barcode))
            ->when($model, fn ($query) => $query->whereKeyNot($model->getKey()))
            ->first(['item_code', 'item_description']);

        if ($existing) {
            $fail("This barcode is already used by {$existing->item_code} ({$existing->item_description}).");

            return;
        }

        $codeClash = Item::query()
            ->where('BC', $this->branchCode())
            ->where('item_code', $barcode)
            ->when($model, fn ($query) => $query->whereKeyNot($model->getKey()))
            ->exists();

        if ($codeClash) {
            $fail('The barcode cannot be the item code of another item.');
        }
    }

    /**
     * UPC-A (12 digits) and its EAN-13 form with a leading zero are the same product.
     */
    private function barcodeVariants(string $barcode): array
    {
        $variants = [$barcode];

        if (ctype_digit($barcode) && strlen($barcode) === 12) {
            $variants[] = '0'.$barcode;
        } elseif (ctype_digit($barcode) && strlen($barcode) === 13 && $barcode[0] === '0') {
            $variants[] = substr($barcode, 1);
        }

        return $variants;
    }

    private function hasValidGs1CheckDigit(string $digits): bool
    {
        $body = substr($digits, 0, -1);
        $sum = 0;
        $weight = 3;

        for ($index = strlen($body) - 1; $index >= 0; $index--) {
            $sum += (int) $body[$index] * $weight;
            $weight = $weight === 3 ? 1 : 3;
        }

        return (10 - ($sum % 10)) % 10 === (int) substr($digits, -1);
    }

    private function duplicateBarcodeResponse(QueryException $exception): JsonResponse
    {
        if (
            in_array($exception->getCode(), ['23000', '23505'], true) &&
            str_contains($exception->getMessage(), 'barcode')
        ) {
            $message = 'This barcode is already used by another item in this branch.';

            return $this->errorResponse($message, 422, ['barcode' => [$message]]);
        }

        throw $exception;
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

        $warrantyEnabled = array_key_exists('warranty_enabled', $validated)
            ? (bool) $validated['warranty_enabled']
            : (bool) $model?->getAttribute('warranty_enabled');

        if (! $warrantyEnabled) {
            $validated['warranty_enabled'] = false;
            $validated['warranty_months'] = null;
        } else {
            $validated['warranty_enabled'] = true;
            $warrantyMonths = array_key_exists('warranty_months', $validated)
                ? $validated['warranty_months']
                : $model?->getAttribute('warranty_months');

            if (! $warrantyMonths) {
                throw ValidationException::withMessages([
                    'warranty_months' => 'Enter the warranty period in months when warranty is included.',
                ]);
            }

            $validated['warranty_months'] = (int) $warrantyMonths;
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
