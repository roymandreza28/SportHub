<?php

use App\Mail\PublicInquiryMail;
use App\Models\PublicInquiry;
use Illuminate\Support\Facades\Mail;

it('lets an anonymous visitor submit an inquiry, records it, notifies the admin, and emails them with reply-to set to the inquirer', function () {
    Mail::fake();
    $admin = userWithRole('admin');

    $response = $this->postJson('/api/public-inquiries', [
        'name' => 'Juan Dela Cruz',
        'email' => 'juan@example.com',
        'topic' => 'Venue Booking',
        'message' => 'How do I book a court for a barangay event?',
    ]);

    $response->assertCreated();
    $response->assertJsonPath('message', "Thanks — we'll get back to you at juan@example.com soon.");

    $this->assertDatabaseHas('public_inquiries', [
        'name' => 'Juan Dela Cruz',
        'email' => 'juan@example.com',
        'topic' => 'Venue Booking',
        'message' => 'How do I book a court for a barangay event?',
    ]);

    $notifications = $this->actingAs($admin)->getJson('/api/notifications')->assertOk();
    expect($notifications->json('0.type'))->toBe('public_inquiry_received');
    expect($notifications->json('0.data.inquirer_email'))->toBe('juan@example.com');
    expect($notifications->json('0.data.topic'))->toBe('Venue Booking');

    Mail::assertSent(PublicInquiryMail::class, function (PublicInquiryMail $mail) use ($admin) {
        return $mail->hasTo($admin->email)
            && $mail->inquiry->email === 'juan@example.com'
            && collect($mail->envelope()->replyTo)->contains(fn ($address) => $address->address === 'juan@example.com');
    });
});

it('works without a name — the inquirer email alone is enough to reply to', function () {
    Mail::fake();
    userWithRole('admin');

    $this->postJson('/api/public-inquiries', [
        'email' => 'anon@example.com',
        'topic' => 'Report a Problem',
        'message' => 'The app keeps logging me out.',
    ])->assertCreated();

    $inquiry = PublicInquiry::first();
    expect($inquiry->name)->toBeNull();
    expect($inquiry->email)->toBe('anon@example.com');
});

it('rejects an inquiry missing a required field, or with a topic outside the fixed list', function () {
    $this->postJson('/api/public-inquiries', [
        'topic' => 'Venue Booking',
        'message' => 'Missing email.',
    ])->assertStatus(422);

    $this->postJson('/api/public-inquiries', [
        'email' => 'x@example.com',
        'topic' => 'Not a real topic',
        'message' => 'y',
    ])->assertStatus(422);

    $this->postJson('/api/public-inquiries', [
        'email' => 'x@example.com',
        'topic' => 'Venue Booking',
    ])->assertStatus(422);
});

it('still creates and stores the inquiry even when no admin account exists', function () {
    Mail::fake();

    $this->postJson('/api/public-inquiries', [
        'email' => 'x@example.com',
        'topic' => 'Other',
        'message' => 'No admin exists yet in this scenario.',
    ])->assertCreated();

    $this->assertDatabaseHas('public_inquiries', ['email' => 'x@example.com']);
    Mail::assertNothingSent();
});

it("lists every inquiry newest-first for the admin's Inquiries & Support tab, and denies every other role", function () {
    $admin = userWithRole('admin');

    PublicInquiry::create(['email' => 'first@example.com', 'topic' => 'Other', 'message' => 'First.']);
    PublicInquiry::create(['email' => 'second@example.com', 'topic' => 'Venue Booking', 'message' => 'Second.']);

    $response = $this->actingAs($admin)->getJson('/api/admin/public-inquiries')->assertOk();
    expect($response->json())->toHaveCount(2);
    expect($response->json('0.email'))->toBe('second@example.com');
    expect($response->json('1.email'))->toBe('first@example.com');

    foreach (['player', 'coach', 'organizer', 'venue_facilitator'] as $role) {
        $this->actingAs(userWithRole($role))->getJson('/api/admin/public-inquiries')->assertForbidden();
    }
});
