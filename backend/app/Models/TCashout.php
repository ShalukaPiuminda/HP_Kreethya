<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TCashout extends Model
{
    protected $table = 't_cashouts';
    protected $fillable = ['Cashout_no', 'Cashout_date', 'Account', 'Cashout_note', 'Cashout_amount', 'BC', 'UID'];
    public $timestamps = false;
    
}
