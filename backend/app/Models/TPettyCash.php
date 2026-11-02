<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TPettyCash extends Model
{
    protected $table = 't_petty_cashes';
    protected $fillable = ['invoice_no', 'date', 'cramount', 'crcode', 'dramount', 'drcode', 'description', 'amount', 'BC', 'UID'];
    public $timestamps = false;
    
}
