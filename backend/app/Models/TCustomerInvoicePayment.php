<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TCustomerInvoicePayment extends Model
{
    protected $table = 't_customer_invoice_payments';
    protected $fillable = ['payment_no', 'sales_invoice_no', 'amount_allocated', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'amount_allocated' => 'decimal:2',
    ];

    public function payment()
    {
        return $this->belongsTo(TCustomerPayment::class, 'payment_no', 'Payment_no');
    }

    public function invoice()
    {
        return $this->belongsTo(TInvoiceSum::class, 'sales_invoice_no', 'Invoice_no');
    }
}
