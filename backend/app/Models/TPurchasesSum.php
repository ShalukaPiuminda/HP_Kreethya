<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TPurchasesSum extends Model
{
    protected $table = 't_purchases_sums';
    protected $fillable = ['Invoice_no', 'Ref_no', 'Invoice_date', 'supplier_code', 'purchase_order_no', 'store_id', 'Customer_NIC', 'Customer_Name', 'Customer_Phone', 'Gross_Amount', 'Discount', 'discount_type', 'discount_value', 'Net_Amount', 'cash_payment', 'credit_payment', 'cheque_payment', 'paid_amount', 'payment_status', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'Invoice_date' => 'date',
        'Gross_Amount' => 'decimal:2',
        'Discount' => 'decimal:2',
        'discount_value' => 'decimal:2',
        'Net_Amount' => 'decimal:2',
        'cash_payment' => 'decimal:2',
        'credit_payment' => 'decimal:2',
        'cheque_payment' => 'decimal:2',
        'paid_amount' => 'decimal:2',
    ];

    public function supplier()
    {
        return $this->belongsTo(Supplier::class, 'supplier_code', 'Code');
    }

    public function order()
    {
        return $this->belongsTo(TPurchaseOrderSum::class, 'purchase_order_no', 'po_no');
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    public function details()
    {
        return $this->hasMany(TPurchasesDetail::class, 'Invoice_no', 'Invoice_no');
    }

    public function allocations()
    {
        return $this->hasMany(TSupplierInvoicePayment::class, 'purchase_invoice_no', 'Invoice_no');
    }
}
