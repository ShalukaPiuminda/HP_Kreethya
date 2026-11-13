<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MSchema extends Model
{
    protected $table = 'm_schemas';
    protected $fillable = ['SchemaType', 'DownpaymentPrecentage', 'InstallmentRate', 'NoOfInstallment', 'DocumentCharagePrecentage', 'PanaltyCharage', 'GracePeriodDays', 'IncludeDocumentCharge', 'DownpaymentRequired', 'CollectFirstInstallment', 'BC', 'UID'];
    public $timestamps = false;

    protected $attributes = [
        'IncludeDocumentCharge' => true,
        'DownpaymentRequired' => true,
        'CollectFirstInstallment' => false,
    ];

    protected $casts = [
        'IncludeDocumentCharge' => 'boolean',
        'DownpaymentRequired' => 'boolean',
        'CollectFirstInstallment' => 'boolean',
    ];
}
