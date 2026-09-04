<?php

namespace Database\Seeders;

use App\Models\Court;
use App\Models\Sport;
use App\Models\User;
use App\Models\Venue;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

// Every venue and price/hours figure here comes from a client-supplied
// research dataset ("Binangonan, Rizal — Sports Venue Rental Dataset",
// compiled 2026-09-03) — coordinates and hours cross-checked against Google
// Maps, prices from a BRCC rate sheet (the only venue in Binangonan that
// publishes one anywhere). Per that dataset's own coverage warning: a blank
// price/hours field means no figure exists on record, NOT that the venue is
// free or 24-hour — those are left null rather than guessed at zero, since
// null already means "not established" throughout this app (Venue::
// price_per_hour, opens_at/closes_at are all nullable for exactly this
// reason). Four fields the source explicitly calls "not specified" or
// "assumed" are noted inline below.
class VenueSeeder extends Seeder
{
    public function run(): void
    {
        $facilitator = User::where('email', 'venue_facilitator@sporthub.test')->first();
        if (! $facilitator) {
            return;
        }

        $sports = Sport::pluck('id', 'name');

        // Full reseed every run, same rationale as every other "rebuild this
        // slice of demo data from scratch" seeder in this codebase — but a
        // real forceDelete() (not the default soft-delete Venue::delete()
        // would do), since a soft-deleted row stays invisible to the
        // firstOrCreate-style name lookups elsewhere in this seeder chain
        // and would leave every re-seed piling up an orphaned trashed
        // duplicate instead of actually starting fresh. Courts/court_sport
        // rows cascade off the real delete.
        Venue::withTrashed()->forceDelete();

        $this->seedBrcc($facilitator, $sports);
        $this->seedJbtc($facilitator, $sports);
        $this->seedDarangan($facilitator);
        $this->seedCrossXCourt($facilitator);
        $this->seedEastridge($facilitator, $sports);
        $this->seedBarangayCourts($facilitator, $sports);
    }

    /** @param  Collection<string, int>  $sports */
    private function seedBrcc(User $facilitator, Collection $sports): void
    {
        $venue = Venue::create([
            'facilitator_id' => $facilitator->id,
            'name' => 'Binangonan Recreation and Conference Center (BRCC)',
            'address' => 'Manila East Road, Brgy. Batingan, Binangonan, Rizal',
            'latitude' => 14.4763,
            'longitude' => 121.2071,
            'description' => "Binangonan's flagship LGU/commercial multi-sport complex. Basketball, volleyball, and badminton share the indoor gymnasium floor; volleyball and tennis share an outdoor court. A separate Bowling Center wing has 12 dedicated duckpin lanes and 8 dedicated ten-pin lanes (not shared with any other sport), plus recreational table tennis and billiards tables. Basketball, volleyball, and tennis run ₱100/hour (basketball and volleyball add a ₱200 advance-booking charge; tennis does not); badminton has no published hourly rate, only a ₱1,500-for-3-courts/3-hours event package; bowling is charged strictly per game, per person (₱50/game/person, not hourly) — full payment due in cash at the Bowling Center cashier before play. The Bowling Center keeps its own hours, 9:00 AM–11:00 PM daily, separate from the rest of the complex's 6:00 AM–12:00 MN. Bowling is walk-in if a lane is free; a group event must be reserved at the cashier rather than through this app, and a reservation is non-refundable but can be rescheduled subject to lane availability. Cash only throughout. Contact: Gymnasium (02) 8650-1962, Bowling Center (02) 8650-1963, Admin (02) 8571-7565 / brcc@binangonan.gov.ph. Booking: walk-in, Facebook, or QR code.",
            'amenities' => ['parking', 'restrooms', 'bowling_lanes', 'billiards'],
            'opens_at' => '06:00',
            'closes_at' => '23:59',
            'status' => 'active',
            // Representative baseline (the ₱100/hour figure shared by
            // basketball/volleyball/tennis) — badminton and bowling are
            // priced differently per-sport, which this venue-level single
            // field can't express; see the description above for the split.
            'price_per_hour' => 100.00,
        ]);

        $this->makeCourt($venue, 'Main Court', 20, [$sports['Basketball']]);
        $this->makeCourt($venue, 'Volleyball Court', 24, [$sports['Volleyball']]);
        // "Recreational tables (number not specified)" per source — table
        // count is an assumption; capacity follows this app's existing
        // table-tennis-corner convention rather than a guessed table count.
        $this->makeCourt($venue, 'Table Tennis Corner', 8, [$sports['Table Tennis']]);
        // The gymnasium's 3 indoor badminton courts, distinct from the demo
        // tournaments' chosen badminton/pickleball venue (JBTC) — BRCC's own
        // courts are real per the source but aren't wired into
        // ExtendedTournamentsSeeder, same as every other non-flagship venue
        // in this file. Sold as a fixed ₱1,500-for-3-hours package per the
        // rate sheet (see the venue description above), not by the hour —
        // block_hours/block_price make VenueRegistrationController enforce
        // and price bookings on this specific court that way instead of via
        // the venue's flat price_per_hour.
        $this->makeCourt($venue, 'Badminton Courts (Gymnasium)', 24, [$sports['Badminton']], blockHours: 3, blockPrice: 1500.00);
        // The Bowling Center wing's own dedicated lanes — genuinely separate
        // from every other court here, both physically (its own wing, own
        // 9:00 AM–11:00 PM hours, see the venue description above) and
        // commercially (₱50/game/person, cash before play, group bookings
        // taken at its own cashier rather than online). That per-game/
        // per-person shape doesn't fit either price_per_hour (hourly) or
        // block_hours/block_price (fixed multi-hour package, used above for
        // badminton) — there's no time-slot rate to enforce here at all, so
        // deliberately left unset rather than forced into either mechanism.
        $this->makeCourt($venue, 'Duckpin Lanes (Bowling Center)', 12, [$sports['Bowling']]);
        $this->makeCourt($venue, 'Ten-Pin Lanes (Bowling Center)', 8, [$sports['Bowling']]);
    }

    /** @param  Collection<string, int>  $sports */
    private function seedJbtc(User $facilitator, Collection $sports): void
    {
        $venue = Venue::create([
            'facilitator_id' => $facilitator->id,
            'name' => 'JBTC Binangonan Badminton and Pickleball Courts',
            'address' => 'Kambingan St., Brgy. Pag-asa, Binangonan, Rizal',
            'latitude' => 14.5160,
            'longitude' => 121.1577,
            'description' => "Newly opened multi-court indoor facility with courts convertible between badminton and pickleball — the only confirmed Pickleball venue in Binangonan. Session-fee pricing; no rate published online, call to inquire. Hours vary by day: 7:00 AM–11:30 PM most days, 7:00 AM–11:00 PM Tue–Wed, and a shortened 9:00 AM–5:00 PM on Thursdays (shown here as the Mon/Fri–Sun window — do not assume it's open until 11:30 PM on a Thursday). The strongest lead of any Binangonan venue in this dataset for actually running a real booking system. Contact: +63 969 430 2002 (phone, Facebook).",
            'amenities' => ['parking'],
            'opens_at' => '07:00',
            'closes_at' => '23:30',
            'status' => 'active',
            'price_per_hour' => null,
        ]);

        $this->makeCourt($venue, 'Court 1', 8, [$sports['Badminton'], $sports['Pickleball']]);
        $this->makeCourt($venue, 'Court 2', 8, [$sports['Badminton'], $sports['Pickleball']]);
    }

    private function seedDarangan(User $facilitator): void
    {
        $venue = Venue::create([
            'facilitator_id' => $facilitator->id,
            'name' => 'Darangan Multi-Purpose Sports Center',
            'address' => 'Manila East Road, Brgy. Darangan, Binangonan, Rizal',
            'latitude' => 14.4911,
            'longitude' => 121.1825,
            'description' => 'Shared multi-use basketball court on Manila East Road. Rate not published — inquire by walk-in.',
            'amenities' => [],
            'opens_at' => '07:00',
            'closes_at' => '22:00',
            'status' => 'active',
            'price_per_hour' => null,
        ]);

        $this->makeCourt($venue, 'Court 1', 20, [Sport::where('name', 'Basketball')->value('id')]);
    }

    private function seedCrossXCourt(User $facilitator): void
    {
        $venue = Venue::create([
            'facilitator_id' => $facilitator->id,
            'name' => 'CrossXCourt Sports Center Binangonan',
            'address' => '1040 Montevilla Ave, Brgy. San Jose, Binangonan, Rizal',
            'latitude' => 14.4990,
            'longitude' => 121.1770,
            'description' => "Multi-sport commercial facility. Court count and per-sport breakdown aren't published in any source, and the booking channel is unconfirmed; listed as open 24 hours. Seeded here with a single Basketball court as an assumption pending confirmation — the source only says \"multi-sport.\"",
            'amenities' => [],
            'opens_at' => null,
            'closes_at' => null,
            'status' => 'active',
            'price_per_hour' => null,
        ]);

        $this->makeCourt($venue, 'Court 1', 20, [Sport::where('name', 'Basketball')->value('id')]);
    }

    /** @param  Collection<string, int>  $sports */
    private function seedEastridge(User $facilitator, Collection $sports): void
    {
        $venue = Venue::create([
            'facilitator_id' => $facilitator->id,
            'name' => 'Eastridge Athletic Park',
            'address' => 'Eastridge Golf & Residential Estates, Binangonan, Rizal',
            'latitude' => 14.5276,
            'longitude' => 121.1763,
            'description' => "Private-estate sports park with dedicated (not shared) basketball and tennis courts. Rate not published — rate enquiries go through the estate's Facebook page or direct contact.",
            'amenities' => ['parking'],
            'opens_at' => null,
            'closes_at' => null,
            'status' => 'active',
            'price_per_hour' => null,
        ]);

        $this->makeCourt($venue, 'Basketball Court', 20, [$sports['Basketball']]);
        $this->makeCourt($venue, 'Court 1', 8, [$sports['Tennis']]);
    }

    /** @param  Collection<string, int>  $sports */
    private function seedBarangayCourts(User $facilitator, Collection $sports): void
    {
        // Rented by permit through the barangay hall (or the subdivision
        // admin for the one non-barangay entry). None publish a rate online
        // — the source found every uniform ₱50–100/hr figure floating
        // around for these to be an unresearched template, not a real
        // published rate, so price is deliberately left null across the
        // board here rather than repeating that unverified number.
        $genericNote = 'Rented by permit through the barangay hall. Fees are set individually by barangay ordinance and not published online — typically charged per booking or per game, not per hour.';

        // [name, barangay-or-location, lat, long, sports, hoursNote]
        $courts = [
            ['Palangoy Covered Court', 'Brgy. Palangoy', 14.4940, 121.1773, ['Basketball', 'Volleyball'], null],
            ['Libis Covered Court', 'Brgy. Libis', 14.4629, 121.1911, ['Basketball', 'Volleyball'], null],
            ['Layunan Covered Court', 'Brgy. Layunan', 14.4684, 121.1933, ['Basketball', 'Volleyball'], null],
            ['Ynares Basketball Court (Bilibiran)', 'Brgy. Bilibiran', 14.4962, 121.1749, ['Basketball'], null],
            ['Macamot Covered Court', 'Brgy. Macamot', 14.4834, 121.1959, ['Basketball'], null],
            ['Darangan Covered Court', 'Brgy. Darangan', 14.4914, 121.1828, ['Basketball'], null],
            ['Barangay Lunsad Multi-Purpose Covered Court', 'Brgy. Lunsad', 14.4605, 121.1946, ['Basketball'], null],
            ['Ynares Village Covered Court', 'Ynares Village', 14.5134, 121.1904, ['Basketball'], 'Listed as open 24 hours.'],
            ['Tolentino Covered Basketball Court', 'Brgy. Tolentino', 14.5243, 121.1651, ['Basketball'], 'Listed as open 24 hours.'],
            ['Brgy. Kinaboogan Covered Court', 'Brgy. Kinaboogan (Talim Island)', 14.3766, 121.2207, ['Basketball'], 'Listed as open 24 hours except Sunday, 5:00 AM–10:00 PM.'],
            ['Flordeliza Basketball Court', 'Brgy. Batingan', 14.4742, 121.2064, ['Basketball'], null],
        ];

        foreach ($courts as [$name, $barangay, $lat, $lng, $sportNames, $hoursNote]) {
            $venue = Venue::create([
                'facilitator_id' => $facilitator->id,
                'name' => $name,
                'address' => "{$barangay}, Binangonan, Rizal",
                'latitude' => $lat,
                'longitude' => $lng,
                'description' => trim($genericNote.' '.($hoursNote ?? '')),
                'amenities' => [],
                'opens_at' => null,
                'closes_at' => null,
                'status' => 'active',
                'price_per_hour' => null,
            ]);

            $this->makeCourt($venue, 'Covered Court', 20, array_map(fn ($s) => $sports[$s], $sportNames));
        }

        // Subdivision-managed, not barangay-managed — same "no published
        // rate" shape, worded to match.
        $townhouse = Venue::create([
            'facilitator_id' => $facilitator->id,
            'name' => 'Townhouse Basketball Covered Court',
            'address' => 'Monique Subdivision, Binangonan, Rizal',
            'latitude' => 14.5161,
            'longitude' => 121.1985,
            'description' => 'Covered basketball court inside the Monique subdivision. Booked through the subdivision admin rather than a barangay hall; rate not published.',
            'amenities' => [],
            'opens_at' => null,
            'closes_at' => null,
            'status' => 'active',
            'price_per_hour' => null,
        ]);
        $this->makeCourt($townhouse, 'Covered Court', 20, [$sports['Basketball']]);
    }

    /** @param  array<int, int>  $sportIds */
    private function makeCourt(
        Venue $venue,
        string $name,
        int $capacity,
        array $sportIds,
        ?int $blockHours = null,
        ?float $blockPrice = null,
    ): Court {
        $court = $venue->courts()->create([
            'name' => $name,
            'type' => 'court',
            'capacity' => $capacity,
            'status' => 'active',
            'block_hours' => $blockHours,
            'block_price' => $blockPrice,
        ]);

        $court->sports()->sync($sportIds);

        return $court;
    }
}
