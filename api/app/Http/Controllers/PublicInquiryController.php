<?php

namespace App\Http\Controllers;

use App\Mail\PublicInquiryMail;
use App\Models\PublicInquiry;
use App\Models\User;
use App\Services\NotificationService;
use App\Support\Broadcasting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

// The landing page's "FAQ" contact section — a fully anonymous visitor (not
// a registered account) reaching the admin directly, unlike ConversationController
// ::contactAdmin()'s in-app FAQ thread, which requires being logged in. Since
// there's no account to reply to inside the app, the inquirer's own email is
// the only way back to them: the admin replies over real email (see
// PublicInquiryMail's reply-to), not through the messaging system.
class PublicInquiryController extends Controller
{
    public const TOPICS = [
        'Account & Registration',
        'Venue Booking',
        'Tournament Registration',
        'Report a Problem',
        'Partnership / Organizer Access',
        'Other',
    ];

    // Admin-only — the "Inquiries & Support" tab's list of every anonymous
    // landing-page contact submission, newest first. Read-only: the admin's
    // actual reply happens over real email (see PublicInquiryMail), not
    // through this endpoint.
    public function index()
    {
        // Order by id, not created_at — two inquiries submitted within the
        // same second (or, in a fast test run, the same call) would
        // otherwise tie and fall back to an undefined order.
        return PublicInquiry::orderByDesc('id')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'topic' => ['required', 'string', Rule::in(self::TOPICS)],
            'message' => ['required', 'string', 'max:2000'],
        ]);

        $inquiry = PublicInquiry::create($data);

        $admin = User::role('admin')->orderBy('id')->first();

        if ($admin) {
            NotificationService::send($admin, 'public_inquiry_received', [
                'inquiry_id' => $inquiry->id,
                'topic' => $inquiry->topic,
                'inquirer_name' => $inquiry->name,
                'inquirer_email' => $inquiry->email,
            ]);

            // Never let a mailer outage (or, today, the dev-only `log`
            // driver with no real SMTP configured) fail this request — the
            // inquiry row above already saved, which is what actually
            // matters if delivery doesn't go through.
            Broadcasting::safely(fn () => Mail::to($admin->email)->send(new PublicInquiryMail($inquiry)));
        }

        return response()->json([
            'message' => "Thanks — we'll get back to you at {$inquiry->email} soon.",
        ], 201);
    }
}
