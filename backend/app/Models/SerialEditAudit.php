<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SerialEditAudit extends Model
{
    protected $fillable = [
        'source_type',
        'source_no',
        'item_code',
        'store_id',
        'old_serial_no',
        'new_serial_no',
        'BC',
        'UID',
    ];
}
