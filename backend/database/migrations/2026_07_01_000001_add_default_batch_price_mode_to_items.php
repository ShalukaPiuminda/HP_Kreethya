<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('default_batch_price_mode', 20)
                ->default('batch')
                ->after('is_batch');
        });

        DB::table('items')
            ->where('is_batch', true)
            ->update(['default_batch_price_mode' => 'batch']);
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('default_batch_price_mode');
        });
    }
};
