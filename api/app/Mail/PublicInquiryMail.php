<?php

namespace App\Mail;

use App\Models\PublicInquiry;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

// Deliberately NOT ShouldQueue — sent synchronously from
// PublicInquiryController::store(), wrapped in Broadcasting::safely() the
// same way WebPush/Reverb dispatches are: a mailer outage (or, today, the
// dev-only `log` driver with no real SMTP configured) must never break the
// request whose actual database record already saved successfully. A
// queued mailable would need a running queue worker this app doesn't have.
class PublicInquiryMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public PublicInquiry $inquiry)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "New inquiry: {$this->inquiry->topic}",
            // The admin's own email client can just hit Reply — it goes
            // straight back to the inquirer's own address, no in-app inbox
            // needed since a landing-page visitor isn't necessarily (or
            // even usually) a registered account.
            replyTo: [new Address($this->inquiry->email, $this->inquiry->name ?: $this->inquiry->email)],
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.public-inquiry',
        );
    }
}
