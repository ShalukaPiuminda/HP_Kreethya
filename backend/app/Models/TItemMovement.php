<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TItemMovement extends Model
{
    protected $table = 't_item_movements';
    protected $fillable = ['trans_no', 'dDate', 'trans_code', 'item_code', 'batch_no', 'store_id', 'qun_in', 'qun_out', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'dDate' => 'date',
        'store_id' => 'integer',
        'qun_in' => 'integer',
        'qun_out' => 'integer',
    ];

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    public function item()
    {
        return $this->belongsTo(Item::class, 'item_code', 'item_code');
    }
}
