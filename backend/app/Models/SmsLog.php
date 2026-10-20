<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SmsLog extends Model
{
    protected $fillable = [
        'type', 'phone', 'message', 'status', 'response', 'invoice_no', 'instalment_id',
        'customer_code', 'customer_name', 'BC', 'sent_by',
    ];
}
