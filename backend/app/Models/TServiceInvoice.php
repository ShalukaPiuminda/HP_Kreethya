<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TServiceInvoice extends Model
{
    protected $table = 't_service_invoices';
    protected $fillable = ['invoice_no', 'ticket_no', 'invoice_date', 'service_charge', 'supplier_repair_cost', 'net_payable', 'paid_amount', 'payment_status', 'invoice_note', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'invoice_date' => 'date',
        'service_charge' => 'decimal:2',
        'supplier_repair_cost' => 'decimal:2',
        'net_payable' => 'decimal:2',
        'paid_amount' => 'decimal:2',
    ];

    public function payments()
    {
        return $this->hasMany(TServiceCustomerPayment::class, 'invoice_no', 'invoice_no');
    }
}
