<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class THirePurchaseToSale extends Model
{
    protected $table = 't_hire_purchase_to_sales';
    protected $fillable = ['conversion_no', 'conversion_date', 'invoice_no', 'agreement_no', 'invoice_date', 'installment_pad_total', 'customer_nic', 'customer_name', 'customer_phone', 'item_net_amount', 'down_payment', 'transport', 'total_instalment_amount', 'due_amount_as_discount', 'discount', 'Document_Charge', 'amount', 'cash_payment', 'card_payment', 'cheque_payment', 'bank_transfer', 'bank_detail_id', 'conversion_note', 'status', 'returned_at', 'return_reason', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'conversion_date' => 'date',
        'amount' => 'decimal:2',
        'returned_at' => 'datetime',
    ];
}
