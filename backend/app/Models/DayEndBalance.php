<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DayEndBalance extends Model
{
    protected $table = 'day_end_balances';
    public $timestamps = false;
    protected $fillable = ['BC', 'close_date', 'opening_balance', 'closing_balance', 'counted_cash', 'variance', 'total_dr', 'total_cr', 'notes', 'closed_by'];

    protected $casts = [
        'close_date' => 'date',
        'opening_balance' => 'decimal:2',
        'closing_balance' => 'decimal:2',
        'counted_cash' => 'decimal:2',
        'variance' => 'decimal:2',
        'total_dr' => 'decimal:2',
        'total_cr' => 'decimal:2',
        'closed_at' => 'datetime',
    ];

    public function closedBy()
    {
        return $this->belongsTo(User::class, 'closed_by');
    }
}
