<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class THirePurchaseSum extends Model
{
    protected $table = 't_hire_purchase_sums';
    protected $fillable = ['invoice_no', 'reference_no', 'opening_reference_no', 'opening_note', 'agreement_no', 'invoice_date', 'customer_code', 'customer_name', 'customer_nic', 'customer_phone', 'customer_address', 'guarantor_1_code', 'guarantor_2_code', 'schema_type', 'store_id', 'document_charge_rate', 'document_charge', 'down_payment_rate', 'down_payment', 'advance_applied', 'down_payment_outstanding', 'transport', 'instalment_rate', 'instalment_amount', 'no_of_instalment', 'instalment_due_date', 'instalment', 'due_amount', 'gross_amount', 'discount', 'discount_type', 'discount_value', 'net_amount', 'contract_amount', 'paid_amount', 'outstanding_amount', 'returned_amount', 'is_cash_converted', 'is_opening', 'status', 'converted_at', 'completed_at', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'invoice_date' => 'date',
        'document_charge' => 'decimal:2',
        'down_payment' => 'decimal:2',
        'advance_applied' => 'decimal:2',
        'down_payment_outstanding' => 'decimal:2',
        'transport' => 'decimal:2',
        'instalment_amount' => 'decimal:2',
        'instalment' => 'decimal:2',
        'due_amount' => 'decimal:2',
        'gross_amount' => 'decimal:2',
        'discount' => 'decimal:2',
        'discount_value' => 'decimal:2',
        'net_amount' => 'decimal:2',
        'contract_amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'outstanding_amount' => 'decimal:2',
        'returned_amount' => 'decimal:2',
        'is_cash_converted' => 'boolean',
        'is_opening' => 'boolean',
        'converted_at' => 'datetime',
        'completed_at' => 'datetime',
    ];
    
    public function details()
    {
        return $this->hasMany(THirePurchaseDetail::class, 'invoice_no', 'invoice_no');
    }

    public function instalments()
    {
        return $this->hasMany(TInstalment::class, 'invoice_no', 'invoice_no');
    }

    public function schema()
    {
        return $this->belongsTo(MSchema::class, 'schema_type', 'SchemaType');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_code', 'Code');
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    public function histories()
    {
        return $this->hasMany(HpStatusHistory::class, 'invoice_no', 'invoice_no')
            ->orderBy('created_at');
    }

    public function conversions()
    {
        return $this->hasMany(THirePurchaseToSale::class, 'invoice_no', 'invoice_no');
    }

    public function returns()
    {
        return $this->hasMany(THirePurchaseReturnSum::class, 'invoice_no', 'invoice_no');
    }

    public function advanceAllocations()
    {
        return $this->hasMany(TCustomerHpAdvanceAllocation::class, 'hp_invoice_no', 'invoice_no');
    }
}
