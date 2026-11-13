<?php

namespace App\Http\Controllers\Api\V1;

use App\Services\Sms\NotifyLkClient;
use App\Support\Nic;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

abstract class BranchScopedCrudController extends BaseController
{
    abstract protected function modelClass(): string;

    abstract protected function rules(?Model $model = null): array;

    protected function resourceName(): string
    {
        return 'record';
    }

    protected function branchScoped(): bool
    {
        return true;
    }

    protected function relationships(): array
    {
        return [];
    }

    protected function relationshipCounts(): array
    {
        return [];
    }

    protected function searchableColumns(): array
    {
        return ['name'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'id';
    }

    protected function defaultOrderDirection(): string
    {
        return 'asc';
    }

    protected function prepareValidatedData(array $validated, ?Model $model = null): array
    {
        foreach (['NIC', 'phone', 'email'] as $field) {
            if (isset($validated[$field]) && is_string($validated[$field])) {
                $validated[$field] = trim($validated[$field]);
            }
        }

        if (isset($validated['email']) && is_string($validated['email'])) {
            $validated['email'] = mb_strtolower($validated['email']);
        }

        if ($this->branchScoped() && $model === null) {
            $validated['BC'] = $this->branchCode();
        }

        if ($this->branchScoped()) {
            $validated['UID'] = auth()->user()->username;
        }

        return $validated;
    }

    /**
     * Sri Lankan NIC: 9 digits + V/X, or 12 digits (see App\Support\Nic).
     * When editing, an unchanged NIC is not re-checked, so records created
     * before this rule can still have their other details updated.
     * $optional: the NIC may be left empty, but must be valid when entered.
     */
    protected function nicRules(bool $required, ?Model $model = null, bool $optional = false): array
    {
        return [
            $optional ? 'nullable' : ($required ? 'required' : 'sometimes'),
            'string',
            'max:15',
            function (string $attribute, mixed $value, callable $fail) use ($model): void {
                if ($model !== null && Nic::normalise((string) $value) === Nic::normalise((string) $model->NIC)) {
                    return;
                }

                if (! Nic::isValid((string) $value)) {
                    $fail('Enter a valid NIC: 9 digits followed by V or X (e.g. 901234567V), or 12 digits (e.g. 199012304567).');
                }
            },
        ];
    }

    /**
     * Normalise the NIC (no spaces, uppercase V/X) before validation, so the
     * format and uniqueness checks see the value that will be stored.
     */
    protected function normaliseRequest(Request $request): void
    {
        if (is_string($request->input('NIC'))) {
            $nic = Nic::normalise($request->input('NIC'));
            // An empty NIC is stored as NULL: many NULLs are allowed by the unique index, '' is not.
            $request->merge(['NIC' => $nic === '' ? null : $nic]);
        }
    }

    protected function phoneRules(): array
    {
        return [
            'nullable',
            'string',
            'max:25',
            function (string $attribute, mixed $value, callable $fail): void {
                if ($value === null || $value === '') {
                    return;
                }

                $digits = preg_replace('/\D+/', '', (string) $value) ?? '';

                if (strlen($digits) < 8) {
                    $fail('The '.$attribute.' must contain at least 8 digits.');
                }
            },
        ];
    }

    /**
     * Sri Lankan mobile number (used for customer SMS), e.g. 0771234567 or +94771234567.
     */
    protected function mobilePhoneRules(): array
    {
        return [
            'nullable',
            'string',
            'max:25',
            function (string $attribute, mixed $value, callable $fail): void {
                if ($value === null || $value === '') {
                    return;
                }

                $normalised = NotifyLkClient::normalisePhone((string) $value);
                if (!$normalised || $normalised[2] !== '7') {
                    $fail('Enter a valid Sri Lankan mobile number, e.g. 0771234567 or +94771234567.');
                }
            },
        ];
    }

    /**
     * Persist an update. Override to run extra work in the same transaction.
     */
    protected function performUpdate(Model $record, array $validated): void
    {
        $record->update($validated);
    }

    protected function beforeDelete(Model $model): ?JsonResponse
    {
        return null;
    }

    protected function query(): Builder
    {
        $modelClass = $this->modelClass();
        $query = $modelClass::query();

        if ($this->branchScoped()) {
            $query->where('BC', $this->branchCode());
        }

        if ($this->relationships() !== []) {
            $query->with($this->relationships());
        }

        if ($this->relationshipCounts() !== []) {
            $query->withCount($this->relationshipCounts());
        }

        return $query;
    }

    protected function findRecord(int|string $id): ?Model
    {
        return $this->query()->find($id);
    }

    protected function branchCode(): string
    {
        return auth()->user()->BC;
    }

    public function index(Request $request): JsonResponse
    {
        $query = $this->query();
        $search = trim((string) $request->query('search', ''));

        if ($search !== '' && $this->searchableColumns() !== []) {
            $query->where(function (Builder $searchQuery) use ($search) {
                foreach ($this->searchableColumns() as $column) {
                    $searchQuery->orWhere($column, 'like', "%{$search}%");
                }
            });
        }

        $query->orderBy(
            $this->defaultOrderColumn(),
            $this->defaultOrderDirection()
        );

        if ($request->boolean('all')) {
            return $this->successResponse(
                $query->get(),
                ucfirst($this->resourceName()).' records retrieved successfully.'
            );
        }

        $perPage = max(1, min((int) $request->query('per_page', 50), 100));

        return $this->paginatedResponse(
            $query->paginate($perPage),
            ucfirst($this->resourceName()).' records retrieved successfully.'
        );
    }

    public function show(int|string $id): JsonResponse
    {
        $record = $this->findRecord($id);

        if (! $record) {
            return $this->errorResponse(
                ucfirst($this->resourceName()).' not found.',
                404
            );
        }

        return $this->successResponse(
            $record,
            ucfirst($this->resourceName()).' retrieved successfully.'
        );
    }

    public function store(Request $request): JsonResponse
    {
        $modelClass = $this->modelClass();
        $this->normaliseRequest($request);
        $validated = $this->prepareValidatedData(
            $request->validate($this->rules())
        );
        $record = $modelClass::create($validated);
        $record->load($this->relationships());
        $record->loadCount($this->relationshipCounts());

        return $this->successResponse(
            $record,
            ucfirst($this->resourceName()).' created successfully.',
            201
        );
    }

    public function update(Request $request, int|string $id): JsonResponse
    {
        $record = $this->findRecord($id);

        if (! $record) {
            return $this->errorResponse(
                ucfirst($this->resourceName()).' not found.',
                404
            );
        }

        $this->normaliseRequest($request);
        $validated = $this->prepareValidatedData(
            $request->validate($this->rules($record)),
            $record
        );

        $this->performUpdate($record, $validated);
        $record->load($this->relationships());
        $record->loadCount($this->relationshipCounts());

        return $this->successResponse(
            $record,
            ucfirst($this->resourceName()).' updated successfully.'
        );
    }

    public function destroy(int|string $id): JsonResponse
    {
        $record = $this->findRecord($id);

        if (! $record) {
            return $this->errorResponse(
                ucfirst($this->resourceName()).' not found.',
                404
            );
        }

        if ($response = $this->beforeDelete($record)) {
            return $response;
        }

        try {
            $record->delete();
        } catch (QueryException $exception) {
            if (in_array($exception->getCode(), ['23000', '23503'], true)) {
                return $this->errorResponse(
                    'This '.$this->resourceName().' is already in use and cannot be deleted.',
                    422
                );
            }

            throw $exception;
        }

        return $this->successResponse(
            null,
            ucfirst($this->resourceName()).' deleted successfully.'
        );
    }
}
