<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MSalesman extends Model
{
    protected $table = 'm_salesmen';
    protected $fillable = ['name', 'phone', 'BC', 'UID'];
    public $timestamps = false;
    
}
