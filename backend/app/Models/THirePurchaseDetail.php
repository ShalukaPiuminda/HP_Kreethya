<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class THirePurchaseDetail extends Model
{
    protected $table = 't_hire_purchase_details';
    protected $fillable = ['invoice_no', 'invoice_date', 'item_code', 'Item_s_code', 'item_description', 'batch_no', 'store_id', 'serial_numbers', 'qty', 'returned_qty', 'unit_price', 'discount_precentage', 'discount', 'discount_type', 'discount_value', 'net_value', 'is_cash_converted', 'BC', 'UID'];

    public $timestamps = false;

    protected $casts = [
        'serial_numbers' => 'array',
        'unit_price' => 'decimal:2',
        'discount' => 'decimal:2',
        'discount_value' => 'decimal:2',
        'net_value' => 'decimal:2',
        'is_cash_converted' => 'boolean',
    ];
    
    public function sum()
    {
        return $this->belongsTo(THirePurchaseSum::class, 'invoice_no', 'invoice_no');
    }

    public function item()
    {
        return $this->belongsTo(Item::class, 'item_code', 'item_code');
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }
}
