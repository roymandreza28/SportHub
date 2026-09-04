<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PublicInquiry extends Model
{
    protected $fillable = ['name', 'email', 'topic', 'message'];
}
