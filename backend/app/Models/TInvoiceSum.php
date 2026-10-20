<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TInvoiceSum extends Model
{
    protected $table = 't_invoice_sums';
    protected $fillable = ['Invoice_no', 'reference_no', 'Invoice_date', 'customer_code', 'store_id', 'salesman_id', 'Customer_NIC', 'Customer_Name', 'Customer_Phone', 'Customer_Address', 'Gross_Amount', 'Discount', 'discount_type', 'discount_value', 'Net_Amount', 'Cash_Pay', 'card_payment', 'Credite', 'Cheque', 'bank_transfer', 'bank_detail_id', 'advance_applied', 'paid_amount', 'returned_amount', 'payment_status', 'status', 'serial_number', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'Invoice_date' => 'date',
        'Gross_Amount' => 'decimal:2',
        'Discount' => 'decimal:2',
        'discount_value' => 'decimal:2',
        'Net_Amount' => 'decimal:2',
        'Cash_Pay' => 'decimal:2',
        'card_payment' => 'decimal:2',
        'Credite' => 'decimal:2',
        'Cheque' => 'decimal:2',
        'bank_transfer' => 'decimal:2',
        'bank_detail_id' => 'integer',
        'advance_applied' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'returned_amount' => 'decimal:2',
    ];

    public function details()
    {
        return $this->hasMany(TInvoiceDeil::class, 'Invoice_no', 'Invoice_no');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_code', 'Code');
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    public function salesman()
    {
        return $this->belongsTo(MSalesman::class, 'salesman_id');
    }

    public function bankAccount()
    {
        return $this->belongsTo(BankDetail::class, 'bank_detail_id');
    }

    public function paymentAllocations()
    {
        return $this->hasMany(TCustomerInvoicePayment::class, 'sales_invoice_no', 'Invoice_no');
    }

    public function advanceAllocations()
    {
        return $this->hasMany(TCustomerAdvanceAllocation::class, 'sales_invoice_no', 'Invoice_no');
    }

    public function returns()
    {
        return $this->hasMany(TSalesReturnSum::class, 'invoice_no', 'Invoice_no');
    }
}
