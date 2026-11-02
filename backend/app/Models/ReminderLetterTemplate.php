<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReminderLetterTemplate extends Model
{
    protected $table = 'reminder_letter_templates';
    protected $fillable = ['stage', 'title', 'body', 'updated_by'];

    protected $casts = [
        'stage' => 'integer',
    ];
}
