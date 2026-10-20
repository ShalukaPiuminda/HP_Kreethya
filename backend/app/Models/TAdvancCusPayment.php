<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TAdvancCusPayment extends Model
{
    protected $table = 't_advanc_cus_payments';
    protected $fillable = ['payment_no', 'payment_date', 'customer_nic', 'customer_name', 'customer_phone', 'payment_note', 'amount', 'remaining_amount', 'cash_payment', 'card_payment', 'cheque_payment', 'bank_transfer', 'bank_detail_id', 'is_carried_forward', 'carried_forward_invoice_no', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'payment_date' => 'date',
        'amount' => 'decimal:2',
        'remaining_amount' => 'decimal:2',
        'cash_payment' => 'decimal:2',
        'card_payment' => 'decimal:2',
        'cheque_payment' => 'decimal:2',
        'bank_transfer' => 'decimal:2',
        'bank_detail_id' => 'integer',
        'is_carried_forward' => 'boolean',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_nic', 'NIC');
    }

    public function allocations()
    {
        return $this->hasMany(TCustomerAdvanceAllocation::class, 'advance_payment_no', 'payment_no');
    }

    public function hpAllocations()
    {
        return $this->hasMany(TCustomerHpAdvanceAllocation::class, 'advance_payment_no', 'payment_no');
    }

    public function bankAccount()
    {
        return $this->belongsTo(BankDetail::class, 'bank_detail_id');
    }
}
