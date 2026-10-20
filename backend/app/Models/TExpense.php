<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TExpense extends Model
{
    protected $table = 't_expenses';
    protected $fillable = ['Expense_no', 'Expense_date', 'ExpenseType', 'expense_account_code', 'Expense_note', 'Expense_Amount', 'payment_method', 'bank_detail_id', 'status', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'Expense_date' => 'date',
        'Expense_Amount' => 'decimal:2',
    ];

    public function account()
    {
        return $this->belongsTo(MChartofAccount::class, 'expense_account_code', 'code');
    }

    public function bankAccount()
    {
        return $this->belongsTo(BankDetail::class, 'bank_detail_id');
    }
}
