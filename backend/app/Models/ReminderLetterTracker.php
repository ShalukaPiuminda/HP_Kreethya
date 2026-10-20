<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReminderLetterTracker extends Model
{
    protected $table = 'reminder_letter_trackers';
    protected $fillable = ['invoice_no', 'BC', 'last_stage', 'last_printed_at', 'next_print_date_override', 'override_note', 'updated_by'];

    protected $casts = [
        'last_stage' => 'integer',
        'last_printed_at' => 'date:Y-m-d',
        'next_print_date_override' => 'date:Y-m-d',
    ];
}
