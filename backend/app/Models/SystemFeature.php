<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SystemFeature extends Model
{
    protected $fillable = ['key', 'enabled', 'enabled_at', 'enabled_by', 'settings'];

    protected $casts = [
        'enabled' => 'boolean',
        'enabled_at' => 'datetime',
        'settings' => 'array',
    ];
}
