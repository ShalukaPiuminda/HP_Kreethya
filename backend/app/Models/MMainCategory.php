<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MMainCategory extends Model
{
    protected $table = 'm_main_categories';
    protected $fillable = ['name'];
    public $timestamps = false;

    public function types()
    {
        return $this->hasMany(MMainAccountType::class, 'category_id');
    }
}
