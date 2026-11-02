<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Color extends Model
{
    protected $table = 'm_colors';
    protected $fillable = ['name', 'BC', 'UID'];
    public $timestamps = false;
    
    public function items()
    {
        return $this->hasMany(Item::class, 'color_id');
    }

}
