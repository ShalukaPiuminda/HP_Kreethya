<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReminderLetterLog extends Model
{
    protected $table = 'reminder_letter_logs';
    protected $fillable = ['invoice_no', 'BC', 'stage', 'recipient_type', 'recipient_code', 'recipient_name', 'arrears_amount', 'printed_by', 'printed_at'];
    public $timestamps = false;

    protected $casts = [
        'stage' => 'integer',
        'arrears_amount' => 'decimal:2',
        'printed_at' => 'datetime',
    ];
}
