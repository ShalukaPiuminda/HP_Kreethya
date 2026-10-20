<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Brand extends Model
{
    protected $table = 'm_brands';
    protected $fillable = ['name', 'BC', 'UID'];
    public $timestamps = false;
    
    public function items()
    {
        return $this->hasMany(Item::class, 'brand_id');
    }

}
