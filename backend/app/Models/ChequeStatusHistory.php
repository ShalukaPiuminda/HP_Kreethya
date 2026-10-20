<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChequeStatusHistory extends Model
{
    protected $table = 'cheque_status_histories';

    protected $fillable = [
        'cheque_type',
        'cheque_id',
        'from_status',
        'to_status',
        'action_date',
        'bank_detail_id',
        'reason',
        'BC',
        'UID',
    ];

    public $timestamps = false;

    protected $casts = [
        'action_date' => 'date',
        'created_at' => 'datetime',
    ];

    public function bankAccount()
    {
        return $this->belongsTo(BankDetail::class, 'bank_detail_id');
    }
}
