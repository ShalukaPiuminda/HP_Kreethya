<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class THirePurchaseReturnSum extends Model
{
    protected $table = 't_hire_purchase_return_sums';
    protected $fillable = ['hpreturn_code', 'return_date', 'store_id', 'invoice_no', 'agreement_no', 'customer_nic', 'reason', 'gross_amount', 'net_amount', 'outstanding_written_off', 'refund_amount', 'status', 'bc', 'oc'];
    public $timestamps = false;

    protected $casts = [
        'return_date' => 'date',
        'gross_amount' => 'decimal:2',
        'net_amount' => 'decimal:2',
        'outstanding_written_off' => 'decimal:2',
        'refund_amount' => 'decimal:2',
    ];

    public function details()
    {
        return $this->hasMany(THirePurchaseReturnDetail::class, 'hpreturn_code', 'hpreturn_code');
    }
}
