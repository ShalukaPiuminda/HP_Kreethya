<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Make extends Model
{
    protected $table = 'm__makes';
    protected $fillable = ['name', 'BC', 'UID'];
    public $timestamps = false;
    
    public function items()
    {
        return $this->hasMany(Item::class, 'make_id');
    }

}
