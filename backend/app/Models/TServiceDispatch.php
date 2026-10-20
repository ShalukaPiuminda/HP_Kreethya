<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TServiceDispatch extends Model
{
    protected $table = 't_service_dispatches';
    protected $fillable = ['dispatch_no', 'ticket_no', 'supplier_code', 'dispatch_date', 'estimated_return', 'received_date', 'supplier_reference', 'dispatch_notes', 'supplier_report', 'repair_cost', 'paid_amount', 'payment_status', 'status', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'dispatch_date' => 'date',
        'estimated_return' => 'date',
        'received_date' => 'date',
        'repair_cost' => 'decimal:2',
        'paid_amount' => 'decimal:2',
    ];

    public function supplier()
    {
        return $this->belongsTo(Supplier::class, 'supplier_code', 'Code');
    }

    public function payments()
    {
        return $this->hasMany(TServiceSupplierPayment::class, 'dispatch_no', 'dispatch_no');
    }
}
