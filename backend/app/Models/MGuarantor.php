<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MGuarantor extends Model
{
    protected $table = 'm_guarantors';
    protected $fillable = ['Code', 'name', 'NIC', 'phone', 'address', 'BC', 'UID'];
    public $timestamps = false;
    
}
