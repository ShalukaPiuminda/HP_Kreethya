<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class THpInstallmentPayment extends Model
{
    protected $table = 't_hp_installment_payments';
    public $timestamps = false;

    protected $fillable = [
        'payment_no',
        'collection_no',
        'instalment_id',
        'invoice_no',
        'payment_date',
        'principal_amount',
        'penalty_amount',
        'discount_amount',
        'total_amount',
        'payment_method',
        'bank_detail_id',
        'note',
        'status',
        'returned_at',
        'return_reason',
        'BC',
        'UID',
    ];

    protected $casts = [
        'payment_date' => 'date',
        'principal_amount' => 'decimal:2',
        'penalty_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'returned_at' => 'datetime',
    ];

    public function instalment()
    {
        return $this->belongsTo(TInstalment::class, 'instalment_id');
    }

    public function bankAccount()
    {
        return $this->belongsTo(BankDetail::class, 'bank_detail_id');
    }
}
