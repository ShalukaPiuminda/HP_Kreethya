<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MSchema extends Model
{
    protected $table = 'm_schemas';

    protected $fillable = [
        'SchemaType',
        'DownpaymentPrecentage',
        'InstallmentRate',
        'NoOfInstallment',
        'DocumentChargeType',
        'DocumentCharagePrecentage',
        'DocumentChargeAmount',
        'PanaltyCharage',
        'GracePeriodDays',
        'IncludeDocumentCharge',
        'DownpaymentRequired',
        'CollectFirstInstallment',
        'BC',
        'UID',
    ];

    public $timestamps = false;

    protected $attributes = [
        'DocumentChargeType' => 'percentage',
        'DocumentCharagePrecentage' => 0.00,
        'DocumentChargeAmount' => 0.00,
        'IncludeDocumentCharge' => true,
        'DownpaymentRequired' => true,
        'CollectFirstInstallment' => false,
    ];

    protected $casts = [
        'DocumentChargeAmount' => 'decimal:2',
        'IncludeDocumentCharge' => 'boolean',
        'DownpaymentRequired' => 'boolean',
        'CollectFirstInstallment' => 'boolean',
    ];

    public function documentChargeRanges(): HasMany
    {
        return $this->hasMany(MSchemaDocumentChargeRange::class, 'schema_id')->orderBy('from_amount', 'asc');
    }
}
