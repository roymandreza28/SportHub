@component('mail::message')
# New inquiry from SportsHub

**Topic:** {{ $inquiry->topic }}<br>
**From:** {{ $inquiry->name ?: 'Not provided' }} ({{ $inquiry->email }})

{{ $inquiry->message }}

Reply directly to this email — it goes straight back to {{ $inquiry->email }}.

Thanks,<br>
SportsHub
@endcomponent
