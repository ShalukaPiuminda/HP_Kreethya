<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MMainAccountType extends Model
{
    protected $table = 'm_main_account_types';
    protected $fillable = ['category_id', 'name'];
    public $timestamps = false;

    public function category()
    {
        return $this->belongsTo(MMainCategory::class, 'category_id');
    }

    public function accounts()
    {
        return $this->hasMany(MChartofAccount::class, 'type_id');
    }

}
