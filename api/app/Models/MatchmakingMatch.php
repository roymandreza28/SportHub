<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MatchmakingMatch extends Model
{
    protected $fillable = ['request_a_id', 'request_b_id', 'matched_at'];

    protected function casts(): array
    {
        return [
            'matched_at' => 'datetime',
        ];
    }

    public function requestA(): BelongsTo
    {
        return $this->belongsTo(MatchmakingRequest::class, 'request_a_id');
    }

    public function requestB(): BelongsTo
    {
        return $this->belongsTo(MatchmakingRequest::class, 'request_b_id');
    }
}
