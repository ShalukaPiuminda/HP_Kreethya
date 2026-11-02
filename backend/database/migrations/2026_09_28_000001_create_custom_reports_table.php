<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('custom_reports', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('slug', 160)->unique();
            $table->text('description')->nullable();
            $table->string('category', 100)->nullable();
            $table->longText('sql_query');
            $table->json('parameters')->nullable();
            $table->json('columns')->nullable();
            $table->boolean('is_published')->default(false);
            $table->integer('sort_order')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamps();
            $table->index(['is_published', 'sort_order'], 'idx_custom_reports_published');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('custom_reports');
    }
};
