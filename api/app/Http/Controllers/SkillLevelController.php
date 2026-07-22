<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class SkillLevelController extends Controller
{
    public function mine(Request $request)
    {
        $profile = $request->user()->playerProfile;

        if (! $profile) {
            return response()->json([]);
        }

        return $profile->skillLevels()->with('sport', 'coach:id,name')->get();
    }
}
