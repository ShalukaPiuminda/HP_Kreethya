<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomReport extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'description',
        'category',
        'sql_query',
        'parameters',
        'columns',
        'layout',
        'is_published',
        'sort_order',
        'created_by',
        'updated_by',
        'BC',
        'UID',
    ];

    protected $casts = [
        'parameters' => 'array',
        'columns' => 'array',
        'layout' => 'array',
        'is_published' => 'boolean',
        'sort_order' => 'integer',
    ];
}
