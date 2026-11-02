<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BankDetail extends Model
{
    protected $table = 'bank_details';
    protected $fillable = ['bank_name', 'account_no', 'BC', 'UID'];
    public $timestamps = false;
    
    public function branches()
    {
        return $this->hasMany(BankBranch::class, 'bank_id');
    }

}
