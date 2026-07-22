<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class PlayerProfileController extends Controller
{
    public function show(Request $request)
    {
        $profile = $request->user()->playerProfile()->firstOrCreate([]);

        return $profile->load('primarySport', 'skillLevels.sport', 'skillLevels.coach:id,name');
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'bio' => ['nullable', 'string', 'max:1000'],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'primary_sport_id' => ['nullable', 'exists:sports,id'],
        ]);

        $profile = $request->user()->playerProfile()->firstOrCreate([]);
        $profile->update($data);

        return $profile->load('primarySport');
    }
}
