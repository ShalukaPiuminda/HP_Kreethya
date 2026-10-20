<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RolePermission extends Model
{
    protected $table = 'role_permissions';
    protected $fillable = ['role_id', 'module', 'can_create', 'can_read', 'can_update', 'can_delete', 'BC', 'UID'];

    protected $casts = [
        'can_create' => 'boolean',
        'can_read' => 'boolean',
        'can_update' => 'boolean',
        'can_delete' => 'boolean',
    ];
    
    public function role()
    {
        return $this->belongsTo(Role::class);
    }

}
