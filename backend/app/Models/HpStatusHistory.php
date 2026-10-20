<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HpStatusHistory extends Model
{
    protected $table = 'hp_status_histories';
    public $timestamps = false;

    protected $fillable = [
        'invoice_no',
        'event',
        'from_status',
        'to_status',
        'description',
        'event_date',
        'BC',
        'UID',
    ];

    protected $casts = [
        'event_date' => 'date',
        'created_at' => 'datetime',
    ];
}
