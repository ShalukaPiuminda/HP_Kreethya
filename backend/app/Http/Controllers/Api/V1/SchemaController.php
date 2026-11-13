<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\MSchema;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SchemaController extends BranchScopedCrudController
{
    protected function modelClass(): string
    {
        return MSchema::class;
    }

    protected function resourceName(): string
    {
        return 'hire purchase scheme';
    }

    protected function relationships(): array
    {
        return ['documentChargeRanges'];
    }

    protected function normaliseRequest(Request $request): void
    {
        parent::normaliseRequest($request);

        foreach (['IncludeDocumentCharge', 'DownpaymentRequired', 'CollectFirstInstallment'] as $field) {
            if ($request->has($field)) {
                $val = $request->input($field);
                if (is_string($val)) {
                    $lower = strtolower(trim($val));
                    if (in_array($lower, ['true', '1'], true)) {
                        $request->merge([$field => true]);
                    } elseif (in_array($lower, ['false', '0'], true)) {
                        $request->merge([$field => false]);
                    }
                } elseif (is_numeric($val)) {
                    $request->merge([$field => (bool) $val]);
                }
            }
        }
    }

    protected function rules(?Model $model = null): array
    {
        $chargeType = request('DocumentChargeType', $model?->DocumentChargeType ?? 'percentage');

        return [
            'SchemaType' => [
                $model ? 'sometimes' : 'required',
                'string',
                'max:50',
                Rule::unique('m_schemas', 'SchemaType')
                    ->ignore($model?->getKey()),
            ],
            'DownpaymentPrecentage' => [
                $model ? 'sometimes' : 'required',
                'numeric',
                'min:0',
                'max:100',
            ],
            'InstallmentRate' => [
                $model ? 'sometimes' : 'required',
                'numeric',
                'min:0',
                'max:100',
            ],
            'NoOfInstallment' => [
                $model ? 'sometimes' : 'required',
                'integer',
                'min:1',
            ],
            'DocumentChargeType' => [
                'sometimes',
                Rule::in(['percentage', 'fixed', 'range']),
            ],
            'DocumentCharagePrecentage' => [
                Rule::requiredIf(fn () => $chargeType === 'percentage'),
                'nullable',
                'numeric',
                'min:0',
                'max:100',
            ],
            'DocumentChargeAmount' => [
                Rule::requiredIf(fn () => $chargeType === 'fixed'),
                'nullable',
                'numeric',
                'min:0',
            ],
            'ranges' => [
                Rule::requiredIf(fn () => $chargeType === 'range'),
                'nullable',
                'array',
                Rule::when($chargeType === 'range', ['min:1']),
                function (string $attribute, mixed $value, \Closure $fail): void {
                    if (! is_array($value)) {
                        return;
                    }

                    $sorted = collect($value)->sortBy('from_amount')->values();
                    for ($i = 0; $i < $sorted->count() - 1; $i++) {
                        $current = $sorted[$i];
                        $next = $sorted[$i + 1];
                        if (isset($current['to_amount'], $next['from_amount']) && (float) $current['to_amount'] >= (float) $next['from_amount']) {
                            $fail("Document charge ranges must not overlap ({$current['from_amount']}-{$current['to_amount']} overlaps with {$next['from_amount']}-{$next['to_amount']}).");
                            return;
                        }
                    }
                },
            ],
            'ranges.*.from_amount' => [
                Rule::requiredIf(fn () => $chargeType === 'range'),
                'numeric',
                'min:0',
            ],
            'ranges.*.to_amount' => [
                Rule::requiredIf(fn () => $chargeType === 'range'),
                'numeric',
                'gt:ranges.*.from_amount',
            ],
            'ranges.*.charge_type' => [
                Rule::requiredIf(fn () => $chargeType === 'range'),
                Rule::in(['percentage', 'fixed']),
            ],
            'ranges.*.charge_value' => [
                Rule::requiredIf(fn () => $chargeType === 'range'),
                'numeric',
                'min:0',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    // Extract range index from "ranges.0.charge_value"
                    if (preg_match('/ranges\.(\d+)\.charge_value/', $attribute, $matches)) {
                        $index = (int) $matches[1];
                        $type = request("ranges.{$index}.charge_type");
                        if ($type === 'percentage' && (float) $value > 100) {
                            $fail('Percentage charge value cannot exceed 100%.');
                        }
                    }
                },
            ],
            'PanaltyCharage' => [
                $model ? 'sometimes' : 'required',
                'numeric',
                'min:0',
                'max:100',
            ],
            'GracePeriodDays' => ['sometimes', 'integer', 'min:0'],
            'IncludeDocumentCharge' => ['sometimes', 'boolean'],
            'DownpaymentRequired' => ['sometimes', 'boolean'],
            'CollectFirstInstallment' => ['sometimes', 'boolean'],
        ];
    }

    public function store(Request $request): JsonResponse
    {
        $this->normaliseRequest($request);
        $validated = $this->prepareValidatedData(
            $request->validate($this->rules())
        );
        $ranges = $validated['ranges'] ?? null;
        unset($validated['ranges']);

        // Set defaults based on charge type
        if (($validated['DocumentChargeType'] ?? 'percentage') === 'percentage') {
            $validated['DocumentChargeAmount'] = 0.00;
        } elseif (($validated['DocumentChargeType'] ?? '') === 'fixed') {
            $validated['DocumentCharagePrecentage'] = 0.00;
        } elseif (($validated['DocumentChargeType'] ?? '') === 'range') {
            $validated['DocumentCharagePrecentage'] = 0.00;
            $validated['DocumentChargeAmount'] = 0.00;
        }

        $record = DB::transaction(function () use ($validated, $ranges) {
            $schema = MSchema::create($validated);
            if ($schema->DocumentChargeType === 'range' && is_array($ranges)) {
                $this->syncRanges($schema, $ranges);
            }
            return $schema;
        });

        $record->load($this->relationships());
        $record->loadCount($this->relationshipCounts());

        return $this->successResponse(
            $record,
            ucfirst($this->resourceName()).' created successfully.',
            201
        );
    }

    protected function performUpdate(Model $record, array $validated): void
    {
        $ranges = $validated['ranges'] ?? null;
        unset($validated['ranges']);

        if (($validated['DocumentChargeType'] ?? $record->DocumentChargeType) === 'percentage') {
            $validated['DocumentChargeAmount'] = 0.00;
        } elseif (($validated['DocumentChargeType'] ?? $record->DocumentChargeType) === 'fixed') {
            $validated['DocumentCharagePrecentage'] = 0.00;
        } elseif (($validated['DocumentChargeType'] ?? $record->DocumentChargeType) === 'range') {
            $validated['DocumentCharagePrecentage'] = 0.00;
            $validated['DocumentChargeAmount'] = 0.00;
        }

        DB::transaction(function () use ($record, $validated, $ranges) {
            $record->update($validated);
            if ($record->DocumentChargeType === 'range' && is_array($ranges)) {
                $this->syncRanges($record, $ranges);
            } else {
                $record->documentChargeRanges()->delete();
            }
        });
    }

    private function syncRanges(MSchema $schema, array $ranges): void
    {
        $schema->documentChargeRanges()->delete();
        foreach ($ranges as $range) {
            $schema->documentChargeRanges()->create([
                'from_amount' => $range['from_amount'],
                'to_amount' => $range['to_amount'],
                'charge_type' => $range['charge_type'],
                'charge_value' => $range['charge_value'],
                'BC' => $schema->BC,
            ]);
        }
    }

    protected function searchableColumns(): array
    {
        return ['SchemaType'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'SchemaType';
    }
}
