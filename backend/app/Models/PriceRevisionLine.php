<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PriceRevisionLine extends Model
{
    public const TARGET_BATCH = 'batch';
    public const TARGET_STANDARD = 'standard';

    protected $fillable = [
        'price_revision_id',
        'target',
        'item_batch_id',
        'batch_no',
        'store_id',
        'old_purchase_price',
        'new_purchase_price',
        'old_sales_price',
        'new_sales_price',
    ];

    protected $casts = [
        'item_batch_id' => 'integer',
        'store_id' => 'integer',
        'old_purchase_price' => 'decimal:2',
        'new_purchase_price' => 'decimal:2',
        'old_sales_price' => 'decimal:2',
        'new_sales_price' => 'decimal:2',
    ];

    public function revision()
    {
        return $this->belongsTo(PriceRevision::class, 'price_revision_id');
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }
}
