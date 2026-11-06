<?php

namespace App\Models;

use App\Services\Sms\NotifyLkClient;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    protected $table = 'customers';
    protected $fillable = ['Code', 'name', 'NIC', 'phone', 'address', 'latitude', 'longitude', 'location_note', 'advance_balance', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
        'advance_balance' => 'decimal:2',
        // Computed by CustomerController::query(): credit sale or HP agreement exists.
        'nic_locked' => 'boolean',
    ];

    /**
     * Store valid mobile numbers as 07XXXXXXXX so SMS always reaches them.
     */
    public function setPhoneAttribute(?string $value): void
    {
        $normalised = NotifyLkClient::normalisePhone($value);
        $this->attributes['phone'] = $normalised ? '0'.substr($normalised, 2) : ($value === '' ? null : $value);
    }

    public function invoices()
    {
        return $this->hasMany(TInvoiceSum::class, 'customer_code', 'Code');
    }

    public function advances()
    {
        return $this->hasMany(TAdvancCusPayment::class, 'customer_code', 'Code');
    }

    public function payments()
    {
        return $this->hasMany(TCustomerPayment::class, 'customer_code', 'Code');
    }
}
