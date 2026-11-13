<?php

namespace App\Services;

use App\Models\Customer;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Invoices, HP agreements, payments, etc. keep a copy of the customer's
 * name / NIC / phone / address. This service keeps those copies in line with
 * the customer master record.
 *
 * Only these text fields are touched: never amounts, balances or statuses.
 * Every overwritten record is written to customer_change_logs with its old
 * values, so any change can be audited or reverted.
 *
 * Deliberately NOT touched: sms_logs and reminder letters (they record what
 * was actually sent), warranty_claims (contact can be typed in manually for
 * the person bringing the item), and purchase tables (Customer_NIC there
 * holds a supplier code).
 */
class CustomerSnapshotService
{
    public const SOURCE_CUSTOMER_UPDATE = 'customer_update';
    public const SOURCE_SYNC_COMMAND = 'sync_command';

    /**
     * table => [
     *   'bc'     => branch column,
     *   'code'   => customer code column (null when the table has none),
     *   'nic'    => NIC column used for matching (null when not stored),
     *   'fields' => customer attribute => column on this table,
     * ]
     */
    private const TABLES = [
        't_invoice_sums' => [
            'bc' => 'BC', 'code' => 'customer_code', 'nic' => 'Customer_NIC',
            'fields' => ['name' => 'Customer_Name', 'NIC' => 'Customer_NIC', 'phone' => 'Customer_Phone', 'address' => 'Customer_Address'],
        ],
        't_hire_purchase_sums' => [
            'bc' => 'BC', 'code' => 'customer_code', 'nic' => 'customer_nic',
            'fields' => ['name' => 'customer_name', 'NIC' => 'customer_nic', 'phone' => 'customer_phone', 'address' => 'customer_address'],
        ],
        't_instalments' => [
            'bc' => 'BC', 'code' => 'customer_code', 'nic' => null,
            'fields' => ['name' => 'customer_name'],
        ],
        't_service_returns' => [
            'bc' => 'BC', 'code' => 'customer_code', 'nic' => 'customer_nic',
            'fields' => ['name' => 'customer_name', 'NIC' => 'customer_nic', 'phone' => 'customer_phone'],
        ],
        'serial_warranties' => [
            'bc' => 'BC', 'code' => 'customer_code', 'nic' => null,
            'fields' => ['name' => 'customer_name', 'phone' => 'customer_phone'],
        ],
        't_customer_payments' => [
            'bc' => 'BC', 'code' => 'customer_code', 'nic' => 'Customer_NIC',
            'fields' => ['name' => 'Customer_Name', 'NIC' => 'Customer_NIC', 'phone' => 'Customer_Phone'],
        ],
        't_advanc_cus_payments' => [
            'bc' => 'BC', 'code' => 'customer_code', 'nic' => 'customer_nic',
            'fields' => ['name' => 'customer_name', 'NIC' => 'customer_nic', 'phone' => 'customer_phone'],
        ],
        't_hire_purchase_to_sales' => [
            'bc' => 'BC', 'code' => null, 'nic' => 'customer_nic',
            'fields' => ['name' => 'customer_name', 'NIC' => 'customer_nic', 'phone' => 'customer_phone'],
        ],
        't_sales_return_sums' => [
            'bc' => 'BC', 'code' => null, 'nic' => 'customer_nic',
            'fields' => ['NIC' => 'customer_nic'],
        ],
        't_hire_purchase_return_sums' => [
            'bc' => 'bc', 'code' => null, 'nic' => 'customer_nic',
            'fields' => ['NIC' => 'customer_nic'],
        ],
    ];

    /**
     * Bring every copy of this customer's details in line with the master record.
     *
     * @param  string|null  $previousNic  NIC before the current edit, so records
     *                                    linked only by NIC are still found.
     * @param  bool  $apply  false = dry run: report what would change, write nothing.
     * @return list<array{table: string, id: int, old: array, new: array}>
     */
    public function sync(
        Customer $customer,
        ?string $previousNic = null,
        bool $apply = true,
        string $source = self::SOURCE_CUSTOMER_UPDATE,
        ?string $uid = null,
        ?string $reason = null
    ): array {
        $run = function () use ($customer, $previousNic, $apply, $source, $uid, $reason): array {
            $nics = $this->identityNics($customer, $previousNic);
            $changes = [];

            foreach (self::TABLES as $table => $config) {
                foreach ($this->matchingRows($table, $config, $customer, $nics) as $row) {
                    $old = [];
                    $new = [];

                    foreach ($config['fields'] as $attribute => $column) {
                        $current = $row->{$column} ?? null;
                        $target = $customer->{$attribute};

                        if ($this->normalise($current) !== $this->normalise($target)) {
                            $old[$column] = $current;
                            $new[$column] = $target;
                        }
                    }

                    if ($new === []) {
                        continue;
                    }

                    $changes[] = ['table' => $table, 'id' => (int) $row->id, 'old' => $old, 'new' => $new];

                    if (! $apply) {
                        continue;
                    }

                    DB::table($table)->where('id', $row->id)->update($new);
                    $this->log($customer, $source, $table, (int) $row->id, $old, $new, $uid, $reason);
                }
            }

            return $changes;
        };

        return $apply ? DB::transaction($run) : $run();
    }

    /**
     * Record a change to the customer master record itself (who, when, what, why).
     *
     * @param  array<string, mixed>  $old  attribute => previous value (changed attributes only)
     */
    public function logCustomerChange(Customer $customer, array $old, ?string $uid, ?string $reason = null): void
    {
        if ($old === []) {
            return;
        }

        $new = [];
        foreach (array_keys($old) as $attribute) {
            $new[$attribute] = $customer->{$attribute};
        }

        $this->log($customer, self::SOURCE_CUSTOMER_UPDATE, 'customers', (int) $customer->getKey(), $old, $new, $uid, $reason);
    }

    /**
     * SQL expression, evaluated per `customers` row, that is true once the
     * customer has an HP agreement or a credit sale (an invoice not fully
     * paid when it was posted). Their NIC is then locked.
     */
    public static function nicLockedSql(): string
    {
        $paidAtPosting = 'COALESCE(i.Cash_Pay, 0) + COALESCE(i.card_payment, 0) + COALESCE(i.Cheque, 0)'
            .' + COALESCE(i.bank_transfer, 0) + COALESCE(i.advance_applied, 0)';

        return '(CASE WHEN EXISTS (SELECT 1 FROM t_hire_purchase_sums h'
            .' WHERE h.BC = customers.BC AND h.customer_code = customers.Code)'
            .' OR EXISTS (SELECT 1 FROM t_invoice_sums i'
            .' WHERE i.BC = customers.BC'
            ." AND (i.customer_code = customers.Code OR ((i.customer_code IS NULL OR i.customer_code = '') AND i.Customer_NIC = customers.NIC))"
            ." AND i.Net_Amount - ({$paidAtPosting}) > 0.009)"
            .' THEN 1 ELSE 0 END)';
    }

    public function isNicLocked(Customer $customer): bool
    {
        return (bool) Customer::query()
            ->whereKey($customer->getKey())
            ->selectRaw(self::nicLockedSql().' as nic_locked')
            ->value('nic_locked');
    }

    private function log(Customer $customer, string $source, string $table, int $recordId, array $old, array $new, ?string $uid, ?string $reason): void
    {
        DB::table('customer_change_logs')->insert([
            'customer_code' => $customer->Code,
            'source' => $source,
            'table_name' => $table,
            'record_id' => $recordId,
            'old_values' => json_encode($old),
            'new_values' => json_encode($new),
            'reason' => $reason,
            'BC' => $customer->BC,
            'UID' => $uid,
            'created_at' => now(),
        ]);
    }

    /**
     * Every NIC this customer has been known by: current, the one before this
     * edit, and any older NIC still sitting on their invoices / HP / tickets.
     * NICs that now belong to a different customer are excluded, so another
     * customer's records can never be picked up.
     *
     * @return list<string>
     */
    private function identityNics(Customer $customer, ?string $previousNic): array
    {
        $nics = collect([$customer->NIC, $previousNic]);

        foreach (self::TABLES as $table => $config) {
            if ($config['code'] === null || $config['nic'] === null) {
                continue;
            }

            $nics = $nics->merge(
                DB::table($table)
                    ->where($config['bc'], $customer->BC)
                    ->where($config['code'], $customer->Code)
                    ->distinct()
                    ->pluck($config['nic'])
            );
        }

        $nics = $nics->filter(fn ($nic) => is_string($nic) && trim($nic) !== '')
            ->map(fn (string $nic) => trim($nic))
            ->unique()
            ->values();

        $ownedByOthers = Customer::query()
            ->whereIn('NIC', $nics)
            ->where('Code', '!=', $customer->Code)
            ->pluck('NIC')
            ->map(fn ($nic) => mb_strtolower((string) $nic))
            ->all();

        return $nics->reject(fn (string $nic) => in_array(mb_strtolower($nic), $ownedByOthers, true))
            ->values()
            ->all();
    }

    private function matchingRows(string $table, array $config, Customer $customer, array $nics)
    {
        $columns = array_values(array_unique(array_merge(['id'], array_values($config['fields']))));

        return DB::table($table)
            ->select($columns)
            ->where($config['bc'], $customer->BC)
            ->where(function (Builder $query) use ($config, $customer, $nics) {
                $matchesSomething = false;

                if ($config['code'] !== null) {
                    $query->orWhere($config['code'], $customer->Code);
                    $matchesSomething = true;
                }

                if ($config['nic'] !== null && $nics !== []) {
                    // Rows that carry a customer code are matched by code only;
                    // NIC is the fallback for legacy rows without a code.
                    $query->orWhere(function (Builder $nested) use ($config, $nics) {
                        $nested->whereIn($config['nic'], $nics);

                        if ($config['code'] !== null) {
                            $nested->where(function (Builder $noCode) use ($config) {
                                $noCode->whereNull($config['code'])->orWhere($config['code'], '');
                            });
                        }
                    });
                    $matchesSomething = true;
                }

                if (! $matchesSomething) {
                    $query->whereRaw('1 = 0');
                }
            })
            ->orderBy('id')
            ->get();
    }

    private function normalise(mixed $value): string
    {
        return trim((string) ($value ?? ''));
    }
}
