<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TPurchasesDetail extends Model
{
    protected $table = 't_purchases_details';
    protected $fillable = ['Invoice_no', 'Ref_no', 'Invoice_date', 'Item_code', 'Item_s_code', 'Item_description', 'batch_no', 'store_id', 'QTY', 'free_qty', 'Unit_price', 'Sales_price', 'serial_numbers', 'Discount', 'discount_type', 'discount_value', 'Net_value', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'Invoice_date' => 'date',
        'QTY' => 'integer',
        'free_qty' => 'integer',
        'Unit_price' => 'decimal:2',
        'Sales_price' => 'decimal:2',
        'serial_numbers' => 'array',
        'Discount' => 'decimal:2',
        'discount_value' => 'decimal:2',
        'Net_value' => 'decimal:2',
    ];

    public function purchase()
    {
        return $this->belongsTo(TPurchasesSum::class, 'Invoice_no', 'Invoice_no');
    }

    public function item()
    {
        return $this->belongsTo(Item::class, 'Item_code', 'item_code');
    }
}
