<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Role extends Model
{
    public const SUPER_ADMIN = 'Super Admin';

    protected $table = 'roles';
    protected $fillable = ['name', 'description'];
    public $timestamps = false;
    
    public function permissions()
    {
        return $this->hasMany(RolePermission::class);
    }

    public function users()
    {
        return $this->hasMany(User::class);
    }

}
