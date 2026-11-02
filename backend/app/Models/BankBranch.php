<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BankBranch extends Model
{
    protected $table = 'bank_branches';
    protected $fillable = ['bank_id', 'branch_name', 'branch_code', 'BC', 'UID'];
    public $timestamps = false;
    
    public function bank()
    {
        return $this->belongsTo(BankDetail::class, 'bank_id');
    }

}
