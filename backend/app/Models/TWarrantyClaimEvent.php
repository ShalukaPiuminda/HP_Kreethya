<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TWarrantyClaimEvent extends Model
{
    protected $table = 't_warranty_claim_events';
    protected $fillable = ['claim_no', 'event', 'description', 'BC', 'UID'];
}
