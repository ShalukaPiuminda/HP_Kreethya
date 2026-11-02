<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MSchema extends Model
{
    protected $table = 'm_schemas';
    protected $fillable = ['SchemaType', 'DownpaymentPrecentage', 'InstallmentRate', 'NoOfInstallment', 'DocumentCharagePrecentage', 'PanaltyCharage', 'GracePeriodDays', 'BC', 'UID'];
    public $timestamps = false;
    
}
