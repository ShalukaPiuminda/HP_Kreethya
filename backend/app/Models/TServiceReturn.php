<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TServiceReturn extends Model
{
    protected $table = 't_service_returns';
    protected $fillable = ['ticket_no', 'return_date', 'customer_nic', 'customer_code', 'customer_name', 'customer_phone', 'item_code', 'item_serial_no', 'problem_description', 'intake_condition', 'is_warranty', 'expected_completion_date', 'assigned_technician', 'repair_summary', 'completed_date', 'status', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'return_date' => 'date',
        'expected_completion_date' => 'date',
        'completed_date' => 'date',
        'is_warranty' => 'boolean',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_code', 'Code');
    }

    public function item()
    {
        return $this->belongsTo(Item::class, 'item_code', 'item_code');
    }

    public function dispatches()
    {
        return $this->hasMany(TServiceDispatch::class, 'ticket_no', 'ticket_no');
    }

    public function issues()
    {
        return $this->hasMany(TServiceIssue::class, 'ticket_no', 'ticket_no');
    }

    public function invoices()
    {
        return $this->hasMany(TServiceInvoice::class, 'ticket_no', 'ticket_no');
    }

    public function tracks()
    {
        return $this->hasMany(TServiceItemTrack::class, 'ticket_no', 'ticket_no')
            ->orderBy('event_date')
            ->orderBy('id');
    }

}
