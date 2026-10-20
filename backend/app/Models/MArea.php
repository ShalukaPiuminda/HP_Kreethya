<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MArea extends Model
{
    protected $table = 'm_areas';
    protected $fillable = ['name', 'BC', 'UID'];
    public $timestamps = false;
    
    public function routes()
    {
        return $this->hasMany(MRoute::class, 'area_id');
    }

}
