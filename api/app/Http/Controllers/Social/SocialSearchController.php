<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class SocialSearchController extends Controller
{
    public function index(Request $request)
    {
        $search = $request->string('search')->toString();

        return User::role(['player', 'coach'])
            ->with('roles:id,name')
            ->where('id', '!=', $request->user()->id)
            ->when($search, fn ($q, $s) => $q
                ->where(fn ($q2) => $q2->where('name', 'ilike', "%{$s}%")->orWhere('email', 'ilike', "%{$s}%")))
            ->orderBy('name')
            ->paginate(20);
    }
}
