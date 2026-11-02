<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TSalesReturnDetail extends Model
{
    protected $table = 't_sales_return_details';
    protected $fillable = ['return_no', 'invoice_detail_id', 'item_code', 'batch_no', 'store_id', 'serial_numbers', 'qty', 'unit_price', 'net_value', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'serial_numbers' => 'array',
        'qty' => 'integer',
        'unit_price' => 'decimal:2',
        'net_value' => 'decimal:2',
    ];

    public function return()
    {
        return $this->belongsTo(TSalesReturnSum::class, 'return_no', 'return_no');
    }

    public function invoiceDetail()
    {
        return $this->belongsTo(TInvoiceDeil::class, 'invoice_detail_id');
    }

    public function item()
    {
        return $this->belongsTo(Item::class, 'item_code', 'item_code');
    }
}
