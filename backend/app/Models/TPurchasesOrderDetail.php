<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TPurchasesOrderDetail extends Model
{
    protected $table = 't_purchases_order_details';
    protected $fillable = ['po_no', 'item_code', 'item_description', 'qty', 'received_qty', 'unit_price', 'net_value', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'qty' => 'integer',
        'received_qty' => 'integer',
        'unit_price' => 'decimal:2',
        'net_value' => 'decimal:2',
    ];

    public function order()
    {
        return $this->belongsTo(TPurchaseOrderSum::class, 'po_no', 'po_no');
    }

    public function item()
    {
        return $this->belongsTo(Item::class, 'item_code', 'item_code');
    }
}
