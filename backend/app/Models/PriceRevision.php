<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PriceRevision extends Model
{
    public const STATUS_APPLIED = 'applied';
    public const STATUS_REVERSED = 'reversed';

    public const SOURCE_MANUAL = 'manual';
    public const SOURCE_REVERSAL = 'reversal';

    protected $fillable = [
        'revision_no',
        'item_code',
        'scope',
        'store_id',
        'price_type',
        'method',
        'sales_value',
        'purchase_value',
        'update_standard',
        'reason',
        'source',
        'source_no',
        'status',
        'reverses_id',
        'reversed_by_revision_id',
        'reversed_by',
        'reversed_at',
        'BC',
        'UID',
    ];

    protected $casts = [
        'store_id' => 'integer',
        'sales_value' => 'decimal:2',
        'purchase_value' => 'decimal:2',
        'update_standard' => 'boolean',
        'reverses_id' => 'integer',
        'reversed_by_revision_id' => 'integer',
        'reversed_at' => 'datetime',
    ];

    public function lines()
    {
        return $this->hasMany(PriceRevisionLine::class);
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
