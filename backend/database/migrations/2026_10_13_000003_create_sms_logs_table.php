<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_logs', function (Blueprint $table) {
            $table->id();
            $table->string('type', 30)->index();
            $table->string('phone', 20)->nullable();
            $table->text('message');
            $table->string('status', 20)->index();
            $table->text('response')->nullable();
            $table->string('invoice_no', 50)->nullable()->index();
            $table->unsignedBigInteger('instalment_id')->nullable()->index();
            $table->string('customer_code', 50)->nullable();
            $table->string('customer_name', 150)->nullable();
            $table->string('BC', 20)->nullable()->index();
            $table->string('sent_by', 50)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_logs');
    }
};
