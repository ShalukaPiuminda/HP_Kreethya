<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TPurchaseOrderSum extends Model
{
    protected $table = 't_purchase_order_sums';
    protected $fillable = ['po_no', 'po_date', 'expected_date', 'supplier_code', 'gross_amount', 'net_amount', 'status', 'notes', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'po_date' => 'date',
        'expected_date' => 'date',
        'gross_amount' => 'decimal:2',
        'net_amount' => 'decimal:2',
    ];

    public function supplier()
    {
        return $this->belongsTo(Supplier::class, 'supplier_code', 'Code');
    }

    public function details()
    {
        return $this->hasMany(TPurchasesOrderDetail::class, 'po_no', 'po_no');
    }

    public function receipts()
    {
        return $this->hasMany(TPurchasesSum::class, 'purchase_order_no', 'po_no');
    }
}
