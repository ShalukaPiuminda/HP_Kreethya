<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SerialWarranty extends Model
{
    protected $table = 'serial_warranties';

    protected $fillable = [
        'item_code',
        'item_serial_no',
        'batch_no',
        'qty',
        'returned_qty',
        'grn_no',
        'grn_date',
        'supplier_code',
        'supplier_warranty_period',
        'supplier_warranty_unit',
        'supplier_warranty_expiry',
        'sale_type',
        'sale_no',
        'sale_date',
        'customer_code',
        'customer_name',
        'customer_phone',
        'warranty_period',
        'warranty_unit',
        'customer_warranty_expiry',
        'status',
        'status_before_cancel',
        'cancel_reason',
        'cancelled_by',
        'cancelled_at',
        'BC',
        'UID',
    ];

    protected $casts = [
        'grn_date' => 'date:Y-m-d',
        'supplier_warranty_expiry' => 'date:Y-m-d',
        'sale_date' => 'date:Y-m-d',
        'customer_warranty_expiry' => 'date:Y-m-d',
        'supplier_warranty_period' => 'integer',
        'warranty_period' => 'integer',
        'qty' => 'integer',
        'returned_qty' => 'integer',
        'cancelled_at' => 'datetime',
    ];

    public function item()
    {
        return $this->belongsTo(Item::class, 'item_code', 'item_code');
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class, 'supplier_code', 'Code');
    }
}
