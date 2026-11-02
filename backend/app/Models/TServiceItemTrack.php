<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TServiceItemTrack extends Model
{
    protected $table = 't_service_item_tracks';
    protected $fillable = ['ticket_no', 'event_name', 'description', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'event_date' => 'datetime',
    ];
}
