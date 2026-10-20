<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReminderLetterSetting extends Model
{
    protected $table = 'reminder_letter_settings';
    protected $fillable = ['letter1_after_days', 'letter2_after_days', 'letter3_after_days', 'seizure_after_days', 'settle_within_days', 'updated_by'];

    protected $casts = [
        'letter1_after_days' => 'integer',
        'letter2_after_days' => 'integer',
        'letter3_after_days' => 'integer',
        'seizure_after_days' => 'integer',
        'settle_within_days' => 'integer',
    ];
}
