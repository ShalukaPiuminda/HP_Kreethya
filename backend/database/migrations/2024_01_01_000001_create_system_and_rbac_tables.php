<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. SYSTEM CONFIGURATION
        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->text('address')->nullable();
            $table->string('phone', 15)->nullable();
            $table->string('email', 100)->nullable();
            $table->timestamps();
        });

        Schema::create('branch_dels', function (Blueprint $table) {
            $table->id();
            $table->string('bccode', 10)->unique();
            $table->string('name', 100);
            $table->string('phone', 15)->nullable();
            $table->text('address')->nullable();
            $table->timestamps();
            $table->index('bccode', 'idx_bccode');
        });

        // 2. USER MANAGEMENT & RBAC
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50)->unique();
            $table->text('description')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('role_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->string('module', 50);
            $table->boolean('can_create')->default(false);
            $table->boolean('can_read')->default(false);
            $table->boolean('can_update')->default(false);
            $table->boolean('can_delete')->default(false);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamps();
            $table->unique(['role_id', 'module'], 'idx_role_module');
            $table->index('BC', 'idx_role_permissions_bc');
        });

        // Add foreign key to users.role_id now that roles table exists
        Schema::table('users', function (Blueprint $table) {
            $table->foreign('role_id')->references('id')->on('roles')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['role_id']);
        });
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('roles');
        Schema::dropIfExists('branch_dels');
        Schema::dropIfExists('companies');
    }
};
