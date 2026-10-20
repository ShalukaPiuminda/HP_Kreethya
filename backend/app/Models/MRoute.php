<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MRoute extends Model
{
    protected $table = 'm_routes';
    protected $fillable = ['name', 'area_id', 'BC', 'UID'];
    public $timestamps = false;
    
    public function area()
    {
        return $this->belongsTo(MArea::class, 'area_id');
    }

}
