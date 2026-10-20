<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TCustomerAccountTrance extends Model
{
    protected $table = 't_customer_account_trances';
    protected $fillable = ['no', 'customer_code', 'dr_amount', 'cr_amount', 'trance_type', 'trance_no', 'dDate', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'dr_amount' => 'decimal:2',
        'cr_amount' => 'decimal:2',
        'dDate' => 'date',
    ];
}
