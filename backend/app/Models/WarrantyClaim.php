<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WarrantyClaim extends Model
{
    protected $table = 'warranty_claims';

    protected $fillable = [
        'claim_no',
        'claim_date',
        'item_code',
        'item_serial_no',
        'qty',
        'batch_no',
        'serial_warranty_id',
        'sale_no',
        'customer_code',
        'customer_name',
        'customer_phone',
        'fault_description',
        'accessories_received',
        'is_within_warranty',
        'customer_warranty_expiry',
        'supplier_code',
        'is_supplier_claimable',
        'status',
        'supplier_ref_no',
        'sent_date',
        'returned_date',
        'resolution',
        'replacement_serial_no',
        'store_id',
        'remarks',
        'service_ticket_no',
        'handed_over_at',
        'handed_over_to',
        'handed_over_nic',
        'handover_note',
        'handed_over_by',
        'cancel_reason',
        'BC',
        'UID',
    ];

    protected $casts = [
        'claim_date' => 'date:Y-m-d',
        'customer_warranty_expiry' => 'date:Y-m-d',
        'sent_date' => 'date:Y-m-d',
        'returned_date' => 'date:Y-m-d',
        'is_within_warranty' => 'boolean',
        'is_supplier_claimable' => 'boolean',
        'store_id' => 'integer',
        'qty' => 'integer',
        'handed_over_at' => 'datetime',
    ];

    public function serviceTicket()
    {
        return $this->belongsTo(TServiceReturn::class, 'service_ticket_no', 'ticket_no');
    }

    public function item()
    {
        return $this->belongsTo(Item::class, 'item_code', 'item_code');
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class, 'supplier_code', 'Code');
    }

    public function serialWarranty()
    {
        return $this->belongsTo(SerialWarranty::class);
    }

    public function logs()
    {
        return $this->hasMany(WarrantyClaimLog::class)->orderBy('id');
    }
}
