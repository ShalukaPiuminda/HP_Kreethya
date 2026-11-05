<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Customer;
use App\Models\RolePermission;
use App\Models\User;
use App\Services\CustomerSnapshotService;
use App\Support\Nic;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CustomerController extends GeneratedCodeCrudController
{
    protected function modelClass(): string
    {
        return Customer::class;
    }

    protected function resourceName(): string
    {
        return 'customer';
    }

    protected function codeField(): string
    {
        return 'Code';
    }

    protected function codePrefix(): string
    {
        return 'CUST';
    }

    protected function rules(?Model $model = null): array
    {
        return [
            'name' => [$model ? 'sometimes' : 'required', 'string', 'max:100'],
            // Optional: cash customers may have none. Valid format when entered.
            // Credit sales and HP agreements check for a valid NIC themselves.
            'NIC' => [
                ...$this->nicRules(false, $model, optional: true),
                Rule::unique('customers', 'NIC')->ignore($model?->getKey()),
            ],
            'phone' => $this->mobilePhoneRules(),
            'address' => ['nullable', 'string'],
            // Only used when changing a locked NIC; never stored on the customer.
            'nic_change_reason' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * Every customer row carries `nic_locked`: true once they have a credit
     * sale or HP agreement. The form uses it to lock the NIC field.
     */
    protected function query(): Builder
    {
        return parent::query()
            ->select('customers.*')
            ->selectRaw(CustomerSnapshotService::nicLockedSql().' as nic_locked');
    }

    protected function prepareValidatedData(array $validated, ?Model $model = null): array
    {
        unset($validated['nic_change_reason']);

        return parent::prepareValidatedData($validated, $model);
    }

    /**
     * Save the customer, log who changed what, and refresh the copied details
     * on their invoices, HP agreements, payments, etc. All in one transaction:
     * if any step fails, the customer edit is rolled back too.
     *
     * Once a customer has a credit sale or HP agreement their NIC is locked:
     * only users with the "Edit NIC" permission (customer-nic, update) can
     * change it, and they must give a reason.
     */
    protected function performUpdate(Model $record, array $validated): void
    {
        $snapshots = app(CustomerSnapshotService::class);
        $user = auth()->user();
        $reason = trim((string) request()->input('nic_change_reason', '')) ?: null;

        DB::transaction(function () use ($record, $validated, $snapshots, $user, &$reason) {
            $tracked = ['name', 'NIC', 'phone', 'address'];
            $before = $record->only($tracked);
            $nicChanging = array_key_exists('NIC', $validated)
                && Nic::normalise((string) $validated['NIC']) !== Nic::normalise((string) $record->NIC);

            if ($nicChanging && $snapshots->isNicLocked($record)) {
                if (blank($validated['NIC'])) {
                    throw ValidationException::withMessages([
                        'NIC' => 'The NIC cannot be removed: this customer has credit sales or HP agreements, which need a NIC.',
                    ]);
                }

                if (! $this->canEditLockedNic($user)) {
                    throw ValidationException::withMessages([
                        'NIC' => 'This customer has credit sales or HP agreements, so their NIC is locked. Ask a manager or admin with the "Edit NIC" permission to change it.',
                    ]);
                }

                if ($reason === null || mb_strlen($reason) < 5) {
                    throw ValidationException::withMessages([
                        'nic_change_reason' => 'Give a reason for changing the NIC (at least 5 characters), e.g. "Typo correction" or "New NIC card issued".',
                    ]);
                }
            } elseif (! $nicChanging) {
                // A reason only belongs on the log when the NIC actually changed.
                $reason = null;
            }

            $record->update($validated);

            $changed = array_intersect($tracked, array_keys($record->getChanges()));
            if ($changed === []) {
                return;
            }

            $snapshots->logCustomerChange(
                $record,
                array_intersect_key($before, array_flip($changed)),
                $user?->username,
                $reason
            );

            $snapshots->sync(
                $record,
                $before['NIC'],
                apply: true,
                source: CustomerSnapshotService::SOURCE_CUSTOMER_UPDATE,
                uid: $user?->username,
                reason: $reason,
            );
        });
    }

    private function canEditLockedNic(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        if ($user->isSuperAdmin() || $user->isDeveloper()) {
            return true;
        }

        return (bool) RolePermission::query()
            ->where('role_id', $user->role_id)
            ->where('module', 'customer-nic')
            ->value('can_update');
    }

    protected function searchableColumns(): array
    {
        return ['Code', 'name', 'NIC', 'phone'];
    }

    protected function defaultOrderColumn(): string
    {
        return 'Code';
    }

    protected function defaultOrderDirection(): string
    {
        return 'asc';
    }
}
