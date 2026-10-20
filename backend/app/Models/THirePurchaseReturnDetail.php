<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class THirePurchaseReturnDetail extends Model
{
    protected $table = 't_hire_purchase_return_details';
    protected $fillable = ['hpreturn_code', 'item_code', 'batch_no', 'store_id', 'serial_numbers', 'qty', 'unit_price', 'net_value', 'bc', 'oc'];
    public $timestamps = false;

    protected $casts = [
        'serial_numbers' => 'array',
        'unit_price' => 'decimal:2',
        'net_value' => 'decimal:2',
    ];
}
