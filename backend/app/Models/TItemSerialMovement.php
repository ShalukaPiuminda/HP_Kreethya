<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TItemSerialMovement extends Model
{
    protected $table = 't_item_serial_movements';
    protected $fillable = ['trans_no', 'trans_code', 'item_code', 'item_description', 'item_serial_no', 'qun_in', 'qun_out', 'store_id', 'dDate', 'bc', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'dDate' => 'date',
        'store_id' => 'integer',
        'qun_in' => 'integer',
        'qun_out' => 'integer',
    ];
}
