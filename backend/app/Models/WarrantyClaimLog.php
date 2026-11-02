<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WarrantyClaimLog extends Model
{
    protected $table = 'warranty_claim_logs';
    protected $fillable = ['warranty_claim_id', 'from_status', 'to_status', 'note', 'UID', 'created_at'];
    public $timestamps = false;

    protected $casts = [
        'created_at' => 'datetime',
    ];
}
