<?php

use App\Services\ReminderLetterService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reminder_letter_settings', function (Blueprint $table) {
            $table->id();
            $table->unsignedSmallInteger('letter1_after_days')->default(30);
            $table->unsignedSmallInteger('letter2_after_days')->default(30);
            $table->unsignedSmallInteger('letter3_after_days')->default(30);
            $table->unsignedSmallInteger('seizure_after_days')->default(30);
            $table->unsignedSmallInteger('settle_within_days')->default(14);
            $table->string('updated_by', 50)->nullable();
            $table->timestamps();
        });

        Schema::create('reminder_letter_templates', function (Blueprint $table) {
            $table->id();
            $table->unsignedTinyInteger('stage')->unique();
            $table->string('title', 150);
            $table->text('body');
            $table->string('updated_by', 50)->nullable();
            $table->timestamps();
        });

        Schema::create('reminder_letter_trackers', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no', 50)->unique();
            $table->string('BC', 20)->index();
            $table->unsignedTinyInteger('last_stage')->default(0);
            $table->date('last_printed_at')->nullable();
            $table->date('next_print_date_override')->nullable();
            $table->string('override_note', 255)->nullable();
            $table->string('updated_by', 50)->nullable();
            $table->timestamps();
        });

        Schema::create('reminder_letter_logs', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no', 50)->index();
            $table->string('BC', 20)->index();
            $table->unsignedTinyInteger('stage');
            $table->string('recipient_type', 20);
            $table->string('recipient_code', 50)->nullable();
            $table->string('recipient_name', 150)->nullable();
            $table->decimal('arrears_amount', 15, 2)->default(0);
            $table->string('printed_by', 50)->nullable();
            $table->timestamp('printed_at')->useCurrent();
        });

        $now = now();
        DB::table('reminder_letter_settings')->insert([
            'letter1_after_days' => 30,
            'letter2_after_days' => 30,
            'letter3_after_days' => 30,
            'seizure_after_days' => 30,
            'settle_within_days' => 14,
            'updated_by' => 'system',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        foreach (ReminderLetterService::DEFAULT_TEMPLATES as $stage => $template) {
            DB::table('reminder_letter_templates')->insert([
                'stage' => $stage,
                'title' => $template['title'],
                'body' => $template['body'],
                'updated_by' => 'system',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('reminder_letter_logs');
        Schema::dropIfExists('reminder_letter_trackers');
        Schema::dropIfExists('reminder_letter_templates');
        Schema::dropIfExists('reminder_letter_settings');
    }
};
