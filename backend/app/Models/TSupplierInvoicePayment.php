<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TSupplierInvoicePayment extends Model
{
    protected $table = 't_supplier_invoice_payments';
    protected $fillable = ['payment_no', 'purchase_invoice_no', 'amount_allocated', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'amount_allocated' => 'decimal:2',
    ];

    public function payment()
    {
        return $this->belongsTo(TSupplierPayment::class, 'payment_no', 'Payment_no');
    }

    public function purchase()
    {
        return $this->belongsTo(TPurchasesSum::class, 'purchase_invoice_no', 'Invoice_no');
    }
}
