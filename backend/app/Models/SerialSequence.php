<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SerialSequence extends Model
{
    protected $fillable = ['BC', 'item_code', 'last_no'];

    protected $casts = [
        'last_no' => 'integer',
    ];
}
