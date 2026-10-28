<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TWarrantyClaim extends Model
{
    protected $table = 't_warranty_claims';
    protected $fillable = ['claim_no', 'claim_date', 'source_type', 'invoice_no', 'agreement_no', 'source_detail_id', 'customer_code', 'customer_name', 'item_code', 'item_description', 'sold_serial_no', 'item_serial_no', 'qty', 'warranty_expiry_date', 'problem_description', 'intake_condition', 'accessories_received', 'resolution', 'status', 'outcome_note', 'decided_date', 'decided_by', 'service_ticket_no', 'replacement_serial_no', 'replacement_batch_no', 'replacement_store_id', 'sales_return_no', 'remarks', 'completed_date', 'delivered_date', 'collected_by', 'handover_note', 'delivered_by', 'store_id', 'BC', 'UID'];

    protected $casts = [
        'claim_date' => 'date:Y-m-d',
        'warranty_expiry_date' => 'date:Y-m-d',
        'completed_date' => 'date:Y-m-d',
        'decided_date' => 'date:Y-m-d',
        'delivered_date' => 'date:Y-m-d',
        'source_detail_id' => 'integer',
        'qty' => 'integer',
        'store_id' => 'integer',
        'replacement_store_id' => 'integer',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_code', 'Code');
    }

    public function item()
    {
        return $this->belongsTo(Item::class, 'item_code', 'item_code');
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    public function events()
    {
        return $this->hasMany(TWarrantyClaimEvent::class, 'claim_no', 'claim_no')->orderBy('id');
    }

    public function serviceTicket()
    {
        return $this->belongsTo(TServiceReturn::class, 'service_ticket_no', 'ticket_no');
    }
}
