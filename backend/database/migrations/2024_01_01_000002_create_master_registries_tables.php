<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 3. MASTER REGISTRIES
        Schema::create('departments', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('BC', 'idx_dept_bc');
        });

        Schema::create('stores', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50);
            $table->string('location', 100)->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('BC', 'idx_store_bc');
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50);
            $table->foreignId('parent_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('parent_id', 'idx_category_parent');
            $table->index('BC', 'idx_category_bc');
        });

        Schema::create('m_brands', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('BC', 'idx_brand_bc');
        });

        Schema::create('m__makes', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('BC', 'idx_make_bc');
        });

        Schema::create('m_colors', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('BC', 'idx_color_bc');
        });

        Schema::create('items', function (Blueprint $table) {
            $table->id();
            $table->string('item_code', 50)->unique();
            $table->string('item_description', 200);
            $table->foreignId('category_id')->nullable()->constrained();
            $table->foreignId('brand_id')->nullable()->constrained('m_brands');
            $table->foreignId('make_id')->nullable()->constrained('m__makes');
            $table->foreignId('color_id')->nullable()->constrained('m_colors');
            $table->boolean('is_batch')->default(false);
            $table->boolean('is_serialized')->default(false);
            $table->integer('reorder_level')->default(0);
            $table->decimal('standard_purchase_price', 15, 2)->default(0);
            $table->decimal('standard_sales_price', 15, 2)->default(0);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('item_code', 'idx_item_code');
            $table->index('BC', 'idx_item_bc');
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('Code', 50)->unique();
            $table->string('name', 100);
            $table->string('NIC', 15)->unique();
            $table->string('phone', 15)->nullable();
            $table->text('address')->nullable();
            $table->decimal('advance_balance', 15, 2)->default(0);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('NIC', 'idx_customer_nic');
            $table->index('BC', 'idx_customer_bc');
        });

        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('Code', 50)->unique();
            $table->string('name', 100);
            $table->string('phone', 15)->nullable();
            $table->text('address')->nullable();
            $table->enum('type', ['normal', 'service'])->default('normal');
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('Code', 'idx_supplier_code');
            $table->index('BC', 'idx_supplier_bc');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
        Schema::dropIfExists('suppliers');
        Schema::dropIfExists('items');
        Schema::dropIfExists('m_colors');
        Schema::dropIfExists('m__makes');
        Schema::dropIfExists('m_brands');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('stores');
        Schema::dropIfExists('departments');
    }
};
