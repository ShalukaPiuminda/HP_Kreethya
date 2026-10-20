<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TCusCheque extends Model
{
    protected $table = 't_cus_cheques';
    protected $fillable = ['trans_no', 'trans_type', 'source_bank_detail_id', 'source_bank_branch_id', 'bank', 'branch_code', 'cheques_no', 'acc_no', 'due_date', 'amount', 'status', 'realized_date', 'bank_detail_id', 'return_reason', 'processed_by', 'status_changed_at', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'due_date' => 'date',
        'realized_date' => 'date',
        'amount' => 'decimal:2',
        'status_changed_at' => 'datetime',
    ];

    public function bankAccount()
    {
        return $this->belongsTo(BankDetail::class, 'bank_detail_id');
    }

    public function sourceBank()
    {
        return $this->belongsTo(BankDetail::class, 'source_bank_detail_id');
    }

    public function sourceBranch()
    {
        return $this->belongsTo(BankBranch::class, 'source_bank_branch_id');
    }

    public function history()
    {
        return $this->hasMany(ChequeStatusHistory::class, 'cheque_id')
            ->where('cheque_type', 'customer')
            ->orderByDesc('created_at');
    }
}
