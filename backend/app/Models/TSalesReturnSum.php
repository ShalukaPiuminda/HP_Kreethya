<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TSalesReturnSum extends Model
{
    protected $table = 't_sales_return_sums';
    protected $fillable = ['return_no', 'return_date', 'invoice_no', 'customer_nic', 'reason_id', 'store_id', 'gross_amount', 'net_amount', 'credit_adjustment', 'refund_amount', 'refund_method', 'status', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'return_date' => 'date',
        'gross_amount' => 'decimal:2',
        'net_amount' => 'decimal:2',
        'credit_adjustment' => 'decimal:2',
        'refund_amount' => 'decimal:2',
    ];

    public function invoice()
    {
        return $this->belongsTo(TInvoiceSum::class, 'invoice_no', 'Invoice_no');
    }

    public function reason()
    {
        return $this->belongsTo(SalesReturnReason::class, 'reason_id');
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    public function details()
    {
        return $this->hasMany(TSalesReturnDetail::class, 'return_no', 'return_no');
    }
}
