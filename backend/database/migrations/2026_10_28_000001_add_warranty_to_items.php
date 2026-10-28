<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->boolean('warranty_enabled')
                ->default(false)
                ->after('is_serialized');
            $table->unsignedSmallInteger('warranty_months')
                ->nullable()
                ->after('warranty_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn([
                'warranty_enabled',
                'warranty_months',
            ]);
        });
    }
};
