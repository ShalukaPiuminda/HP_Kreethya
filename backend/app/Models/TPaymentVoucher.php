<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TPaymentVoucher extends Model
{
    protected $table = 't_payment_vouchers';
    protected $fillable = ['invoice_no', 'date', 'cramount', 'crcode', 'dramount', 'drcode', 'description', 'amount', 'status', 'payment_method', 'bank_detail_id', 'approved_by', 'approved_at', 'cancellation_reason', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'date' => 'date',
        'amount' => 'decimal:2',
        'approved_at' => 'datetime',
    ];

    public function debitAccount()
    {
        return $this->belongsTo(MChartofAccount::class, 'drcode', 'code');
    }

    public function creditAccount()
    {
        return $this->belongsTo(MChartofAccount::class, 'crcode', 'code');
    }

    public function bankAccount()
    {
        return $this->belongsTo(BankDetail::class, 'bank_detail_id');
    }
}
