<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TCustomerHpAdvanceAllocation extends Model
{
    protected $table = 't_customer_hp_advance_allocations';
    public $timestamps = false;

    protected $fillable = [
        'advance_payment_no',
        'hp_invoice_no',
        'amount_allocated',
        'BC',
        'UID',
    ];

    protected $casts = [
        'amount_allocated' => 'decimal:2',
    ];

    public function advance()
    {
        return $this->belongsTo(TAdvancCusPayment::class, 'advance_payment_no', 'payment_no');
    }

    public function agreement()
    {
        return $this->belongsTo(THirePurchaseSum::class, 'hp_invoice_no', 'invoice_no');
    }
}
