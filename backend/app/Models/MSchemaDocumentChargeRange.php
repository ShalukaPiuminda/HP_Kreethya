<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MSchemaDocumentChargeRange extends Model
{
    protected $table = 'm_schema_document_charge_ranges';

    protected $fillable = [
        'schema_id',
        'from_amount',
        'to_amount',
        'charge_type',
        'charge_value',
        'BC',
    ];

    protected $casts = [
        'from_amount' => 'decimal:2',
        'to_amount' => 'decimal:2',
        'charge_value' => 'decimal:2',
    ];

    public function schema(): BelongsTo
    {
        return $this->belongsTo(MSchema::class, 'schema_id');
    }
}

