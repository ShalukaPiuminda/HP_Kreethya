<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TServiceSupplierPayment extends Model
{
    protected $table = 't_service_supplier_payments';
    protected $fillable = ['payment_no', 'dispatch_no', 'payment_date', 'amount', 'payment_method', 'bank_detail_id', 'payment_note', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'payment_date' => 'date',
        'amount' => 'decimal:2',
    ];

    public function bankAccount()
    {
        return $this->belongsTo(BankDetail::class, 'bank_detail_id');
    }
}
