<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Store extends Model
{
    protected $table = 'stores';
    protected $fillable = ['name', 'location', 'BC', 'UID'];
    public $timestamps = false;

    public function batches()
    {
        return $this->hasMany(ItemBatch::class);
    }

    public function movements()
    {
        return $this->hasMany(TItemMovement::class);
    }
}
