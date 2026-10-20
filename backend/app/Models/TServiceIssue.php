<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TServiceIssue extends Model
{
    protected $table = 't_service_issues';
    protected $fillable = ['issue_no', 'ticket_no', 'issue_date', 'status', 'technician_name', 'completed_date', 'diagnosis', 'repair_details', 'parts_used', 'labor_charge', 'BC', 'UID'];
    public $timestamps = false;

    protected $casts = [
        'issue_date' => 'date',
        'completed_date' => 'date',
        'labor_charge' => 'decimal:2',
    ];
}
