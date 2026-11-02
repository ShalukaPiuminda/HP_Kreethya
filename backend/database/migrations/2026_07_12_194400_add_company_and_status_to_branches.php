<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branch_dels', function (Blueprint $table) {
            $table->foreignId('company_id')
                ->nullable()
                ->after('id')
                ->constrained('companies')
                ->nullOnDelete();
            $table->boolean('is_active')->default(true)->after('address');
            $table->index(['company_id', 'is_active'], 'idx_branch_company_status');
        });
    }

    public function down(): void
    {
        Schema::table('branch_dels', function (Blueprint $table) {
            $table->dropIndex('idx_branch_company_status');
            $table->dropConstrainedForeignId('company_id');
            $table->dropColumn('is_active');
        });
    }
};
