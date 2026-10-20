<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MChartofAccount extends Model
{
    protected $table = 'm_chartof_accounts';
    protected $fillable = ['code', 'description', 'type_id', 'is_active', 'opening_balance', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'is_active' => 'boolean',
        'opening_balance' => 'decimal:2',
    ];
    
    public function type()
    {
        return $this->belongsTo(MMainAccountType::class, 'type_id');
    }

    public function transactions()
    {
        return $this->hasMany(TAccountTran::class, 'AccCode', 'code');
    }
}
