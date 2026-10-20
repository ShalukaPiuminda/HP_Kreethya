<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TAccountTran extends Model
{
    protected $table = 't_account_trans';
    protected $fillable = ['trance_type', 'Ddate', 'dr_amount', 'cr_amount', 'AccCode', 'trance_no', 'no', 'BC', 'UID'];
    public $timestamps = false;
    
    public function account()
    {
        return $this->belongsTo(MChartofAccount::class, 'AccCode', 'code');
    }

}
