<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BranchDel extends Model
{
    protected $table = 'branch_dels';
    protected $fillable = ['company_id', 'bccode', 'name', 'phone', 'address', 'is_active'];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }
}
