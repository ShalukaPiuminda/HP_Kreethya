<?php

namespace App\Models;

use App\Services\Sms\NotifyLkClient;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    protected $table = 'customers';
    protected $fillable = ['Code', 'name', 'NIC', 'phone', 'address', 'advance_balance', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'advance_balance' => 'decimal:2',
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
        return $this->hasMany(TAdvancCusPayment::class, 'customer_nic', 'NIC');
    }

    public function payments()
    {
        return $this->hasMany(TCustomerPayment::class, 'Customer_NIC', 'NIC');
    }
}
