<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Item extends Model
{
    protected $table = 'items';
    protected $fillable = ['item_code', 'item_description', 'category_id', 'brand_id', 'make_id', 'color_id', 'is_batch', 'default_batch_price_mode', 'is_serialized', 'reorder_level', 'sales_criteria_enabled', 'min_sales_qty', 'max_sales_qty', 'min_sales_price', 'max_sales_price', 'standard_purchase_price', 'standard_sales_price', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'is_batch' => 'boolean',
        'is_serialized' => 'boolean',
        'reorder_level' => 'integer',
        'sales_criteria_enabled' => 'boolean',
        'min_sales_qty' => 'integer',
        'max_sales_qty' => 'integer',
        'min_sales_price' => 'decimal:2',
        'max_sales_price' => 'decimal:2',
        'standard_purchase_price' => 'decimal:2',
        'standard_sales_price' => 'decimal:2',
    ];
    
    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function brand()
    {
        return $this->belongsTo(Brand::class, 'brand_id');
    }

    public function make()
    {
        return $this->belongsTo(Make::class, 'make_id');
    }

    public function color()
    {
        return $this->belongsTo(Color::class, 'color_id');
    }

    public function batches()
    {
        return $this->hasMany(ItemBatch::class, 'item_code', 'item_code');
    }

    public function movements()
    {
        return $this->hasMany(TItemMovement::class, 'item_code', 'item_code');
    }

}
