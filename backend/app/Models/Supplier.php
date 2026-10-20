<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Supplier extends Model
{
    protected $table = 'suppliers';
    protected $fillable = ['Code', 'name', 'phone', 'address', 'type', 'BC', 'UID'];
    public $timestamps = false;
    
}
