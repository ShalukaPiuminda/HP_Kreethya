<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockAdjustment extends Model
{
    public const REASONS = [
        'COUNT_CORRECTION',
        'DAMAGED',
        'LOST',
        'EXPIRED',
        'FOUND',
        'OTHER',
    ];

    protected $fillable = [
        'trans_no',
        'item_code',
        'store_id',
        'batch_no',
        'old_qty',
        'new_qty',
        'diff_qty',
        'reason',
        'note',
        'serial_numbers',
        'BC',
        'UID',
    ];

    protected $casts = [
        'store_id' => 'integer',
        'old_qty' => 'integer',
        'new_qty' => 'integer',
        'diff_qty' => 'integer',
        'serial_numbers' => 'array',
    ];

    public function store()
    {
        return $this->belongsTo(Store::class);
    }
}
