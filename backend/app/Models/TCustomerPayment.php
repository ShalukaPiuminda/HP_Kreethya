<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TCustomerPayment extends Model
{
    protected $table = 't_customer_payments';
    protected $fillable = ['Payment_no', 'Payment_date', 'Customer_NIC', 'Customer_Name', 'Customer_Phone', 'Payment_note', 'Payment_Amount', 'cash_payment', 'card_payment', 'cheque_payment', 'bank_transfer', 'bank_detail_id', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'Payment_date' => 'date',
        'Payment_Amount' => 'decimal:2',
        'cash_payment' => 'decimal:2',
        'card_payment' => 'decimal:2',
        'cheque_payment' => 'decimal:2',
        'bank_transfer' => 'decimal:2',
        'bank_detail_id' => 'integer',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'Customer_NIC', 'NIC');
    }

    public function allocations()
    {
        return $this->hasMany(TCustomerInvoicePayment::class, 'payment_no', 'Payment_no');
    }

    public function bankAccount()
    {
        return $this->belongsTo(BankDetail::class, 'bank_detail_id');
    }
}
