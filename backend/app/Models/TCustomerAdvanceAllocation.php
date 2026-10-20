<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TCustomerAdvanceAllocation extends Model
{
    protected $table = 't_customer_advance_allocations';
    protected $fillable = ['advance_payment_no', 'sales_invoice_no', 'amount_allocated', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'amount_allocated' => 'decimal:2',
    ];

    public function advance()
    {
        return $this->belongsTo(TAdvancCusPayment::class, 'advance_payment_no', 'payment_no');
    }

    public function invoice()
    {
        return $this->belongsTo(TInvoiceSum::class, 'sales_invoice_no', 'Invoice_no');
    }
}
