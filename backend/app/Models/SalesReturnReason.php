<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SalesReturnReason extends Model
{
    protected $table = 'sales_return_reasons';
    protected $fillable = ['reason', 'BC', 'UID'];
    public $timestamps = false;
    
}
