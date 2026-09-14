<?php

namespace App\Policies;

use App\Models\GameMatch;
use App\Models\TournamentRegistration;
use App\Models\User;
use App\Support\StatSheetFieldSets;

class MatchPolicy
{
    public function updateScore(User $user, GameMatch $gameMatch): bool
    {
        if (! $user->can('update match score')) {
            return false;
        }

        $tournament = $gameMatch->bracket->tournament;

        // Once a venue organizer is assigned, scoring is exclusively their
        // job — not the main organizer's, even for a tournament they
        // created themselves, so two people are never both trying to score
        // the same game. venue_organizer_id is optional now (see
        // TournamentController::store()), though — when nothing was
        // assigned, the main organizer runs the scoreboard themselves
        // instead of leaving no one able to.
        if ($tournament->venue_organizer_id !== null) {
            return $tournament->venue_organizer_id === $user->id;
        }

        return $tournament->organizer_id === $user->id;
    }

    // Setting the date/time/court is the main organizer's job — distinct
    // from updateScore() above, which belongs to the venue organizer instead.
    public function schedule(User $user, GameMatch $gameMatch): bool
    {
        return $gameMatch->bracket->tournament->organizer_id === $user->id;
    }

    // A coach may view/fill a stat sheet only for their own side, only for a
    // sport StatSheetFieldSets actually has columns for. MatchStatSheetController
    // derives *which* side from this same check, so no team_id/user_id ever
    // comes from the client. A team match (Basketball, Volleyball, and
    // racquet-sport doubles) is authorized by team captaincy; an individual
    // match (racquet-sport singles, no Team at all) is authorized by who
    // registered that player for the tournament — see
    // TournamentRegistrationController::store()'s `registered_by` column.
    public function viewStatSheet(User $user, GameMatch $gameMatch): bool
    {
        $tournament = $gameMatch->bracket->tournament;

        if (StatSheetFieldSets::for($tournament->sport->name, $tournament->sportFormat?->name) === null) {
            return false;
        }

        if ($gameMatch->participant_a_team_id !== null) {
            return $gameMatch->participantATeam?->captain_id === $user->id
                || $gameMatch->participantBTeam?->captain_id === $user->id;
        }

        return TournamentRegistration::where('tournament_id', $tournament->id)
            ->whereIn('user_id', array_filter([$gameMatch->participant_a_id, $gameMatch->participant_b_id]))
            ->where('registered_by', $user->id)
            ->exists();
    }
}
