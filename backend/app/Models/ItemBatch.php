<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ItemBatch extends Model
{
    protected $table = 'item_batches';
    protected $fillable = ['batch_no', 'item_code', 'store_id', 'purchase_price', 'sales_price', 'qty_in_hand', 'BC', 'UID'];

    protected $casts = [
        'store_id' => 'integer',
        'purchase_price' => 'decimal:2',
        'sales_price' => 'decimal:2',
        'qty_in_hand' => 'integer',
    ];
    
    public function item()
    {
        return $this->belongsTo(Item::class, 'item_code', 'item_code');
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

}
