<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('custom_reports', function (Blueprint $table) {
            // Page size, orientation, header/footer and table colours (see CustomReportLayout).
            $table->json('layout')->nullable()->after('columns');
        });
    }

    public function down(): void
    {
        Schema::table('custom_reports', function (Blueprint $table) {
            $table->dropColumn('layout');
        });
    }
};
