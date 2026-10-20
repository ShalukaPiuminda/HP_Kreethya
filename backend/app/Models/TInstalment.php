<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TInstalment extends Model
{
    protected $table = 't_instalments';
    protected $fillable = ['invoice_no', 'agreement_no', 'invoice_date', 'customer_code', 'customer_name', 'instalment_no', 'instalment_date', 'instalment_amount', 'base_amount', 'instalment', 'amount_pay', 'balance_amount', 'up_date', 'cash_payment', 'card_payment', 'cheque_payment', 'bank_transfer', 'discount', 'penalty_amount', 'penalty_total_amount', 'is_waived', 'status', 'last_payment_at', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'invoice_date' => 'date',
        'instalment_date' => 'date',
        'instalment_amount' => 'decimal:2',
        'base_amount' => 'decimal:2',
        'amount_pay' => 'decimal:2',
        'balance_amount' => 'decimal:2',
        'discount' => 'decimal:2',
        'penalty_amount' => 'decimal:2',
        'penalty_total_amount' => 'decimal:2',
        'is_waived' => 'boolean',
        'last_payment_at' => 'datetime',
    ];
    
    public function sum()
    {
        return $this->belongsTo(THirePurchaseSum::class, 'invoice_no', 'invoice_no');
    }

    public function payments()
    {
        return $this->hasMany(THpInstallmentPayment::class, 'instalment_id')->orderBy('payment_date');
    }
}
