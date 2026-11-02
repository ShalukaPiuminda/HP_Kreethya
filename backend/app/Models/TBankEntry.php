<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TBankEntry extends Model
{
    protected $table = 't_bank_entries';
    protected $fillable = ['invoice_no', 'bank_detail_id', 'entry_type', 'date', 'cramount', 'crcode', 'dramount', 'drcode', 'description', 'amount', 'bank_charges', 'status', 'BC', 'UID'];
    public $timestamps = false;

    public function bankAccount()
    {
        return $this->belongsTo(BankDetail::class, 'bank_detail_id');
    }

    public function debitAccount()
    {
        return $this->belongsTo(MChartofAccount::class, 'drcode', 'code');
    }

    public function creditAccount()
    {
        return $this->belongsTo(MChartofAccount::class, 'crcode', 'code');
    }
}
