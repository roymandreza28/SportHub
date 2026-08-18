import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTournament,
  fetchAvailableOrganizers,
  generateBracket,
  type ScoringType,
  type TournamentFormat,
} from '../../lib/organizerApi'
import { fetchSports, fetchSportFormats } from '../../lib/venueApi'
import { buttonPrimary, buttonSuccess, fieldGroup, input, label, select } from '../../lib/formStyles'

const ALL_FORMATS: TournamentFormat[] = ['single_elimination', 'double_elimination', 'round_robin', 'group_stage', 'swiss']

// Which bracket types each sport's dropdown offers, and in what order —
// sourced from each sport's governing body or standard tournament practice
// for the sports this platform runs. Basketball keeps every format; the
// rest are trimmed to what's actually used for that sport. (Volleyball's
// "Ladder Challenge" and tennis's "Ladder/Pyramid" are ongoing ranking
// systems, not a single-event bracket, so they're deliberately left out —
// see the ladder-challenge memory note for the deferred-feature reasoning.)
const SPORT_FORMATS: Record<string, TournamentFormat[]> = {
  Basketball: ['single_elimination', 'double_elimination', 'round_robin', 'group_stage'],
  Volleyball: ['round_robin', 'single_elimination', 'double_elimination', 'group_stage'],
  Badminton: ['single_elimination', 'double_elimination', 'round_robin', 'swiss', 'group_stage'],
  Pickleball: ['single_elimination', 'double_elimination', 'group_stage'],
  Tennis: ['single_elimination', 'double_elimination', 'round_robin', 'group_stage', 'swiss'],
  'Table Tennis': ['round_robin', 'single_elimination', 'swiss'],
}

const FORMAT_LABELS: Record<TournamentFormat, string> = {
  single_elimination: 'Single elimination',
  double_elimination: 'Double elimination',
  round_robin: 'Round robin',
  group_stage: 'Group stage + knockout',
  swiss: 'Swiss system',
}

const FORMAT_NOTES: Record<string, Partial<Record<TournamentFormat, string>>> = {
  Basketball: {
    single_elimination: 'Simple knockout, good for large fields with limited time — used by tournaments like March Madness.',
    double_elimination: 'Gives every team a second chance after one loss — common at amateur/local basketball tournaments.',
    round_robin: 'Everyone plays everyone — best kept to 6-8 teams.',
    group_stage: 'Pool play into a knockout bracket — the most popular format for amateur basketball tournaments.',
  },
  Volleyball: {
    round_robin: 'Every team plays every other team at least once; the top 4 qualify for playoffs.',
    single_elimination: 'Teams are paired off in a bracket — the loser of each match is eliminated immediately.',
    double_elimination: 'Teams are eliminated only after two losses — straightforward and decisive.',
    group_stage: 'Pool play, then the top teams from each pool advance — the gold standard volleyball format.',
  },
  Badminton: {
    single_elimination: 'Quick, but can be unfair — one bad game ends a strong player\'s run.',
    double_elimination: 'Offers a second chance in the losers\' bracket after one loss.',
    round_robin: 'Every player faces everyone in the group — fair ranking, more matches. Best for small tournaments.',
    swiss: 'Fixed number of rounds, no elimination, similar-record players paired each round — best for large tournaments where ranking accuracy matters.',
    group_stage: 'A hybrid of round robin and knockout — balances fairness and time, suited to medium-sized tournaments.',
  },
  Pickleball: {
    single_elimination: 'Fast and dramatic — ideal for tournaments with limited time or 16+ teams, but one bad game eliminates a team.',
    double_elimination: 'Teams move to a losers\' bracket after one loss and can still reach the finals — more forgiving, commonly used in competitive events.',
    group_stage: 'Small groups (3-5) play each other, then top performers advance to an elimination bracket — guarantees multiple games, common at USAP-sanctioned events.',
  },
  Tennis: {
    single_elimination: 'The most common format for professional tournaments, including Grand Slams — simple, fast, and builds toward a final.',
    double_elimination: 'A player is eliminated only after a second loss — increases fairness, at the cost of more matches.',
    round_robin: 'Every player faces every other participant — maximizes playing time, suited to club championships and social events.',
    group_stage: 'Small round-robin groups, then the top finishers advance to a single-elimination bracket — common in larger club or inter-club competitions.',
    swiss: 'Players with similar records are paired each round, avoiding early mismatches — good for medium-sized tournaments.',
  },
  'Table Tennis': {
    round_robin: 'Every player faces every other player — fair and predictable, ideal for small fields and leagues.',
    single_elimination: 'Also called "Knockout" — lose once and you\'re out. Fast-paced, but needs one strong performance throughout.',
    swiss: 'Players are matched against opponents with similar records each round — ideal for larger fields.',
  },
}

const SCORING_OPTIONS: { value: string; label: string; scoringType: ScoringType; setsToWin?: number }[] = [
  { value: 'single_score', label: 'Single score', scoringType: 'single_score' },
  { value: 'best_of_3', label: 'Best of 3 sets', scoringType: 'best_of_sets', setsToWin: 2 },
  { value: 'best_of_5', label: 'Best of 5 sets', scoringType: 'best_of_sets', setsToWin: 3 },
  { value: 'best_of_7', label: 'Best of 7 sets', scoringType: 'best_of_sets', setsToWin: 4 },
]

export function TournamentWizard() {
  const queryClient = useQueryClient()
  const { data: sports } = useQuery({ queryKey: ['sports'], queryFn: fetchSports })
  const { data: organizers } = useQuery({ queryKey: ['organizer', 'available-organizers'], queryFn: fetchAvailableOrganizers })

  // Collapsed by default — the full form is a dozen-plus fields, which used
  // to sit permanently expanded above the tournament list every time this
  // tab was opened, even just to check on existing tournaments.
  const [open, setOpen] = useState(false)

  const [sportId, setSportId] = useState<number | ''>('')
  const [sportFormatId, setSportFormatId] = useState<number | ''>('')
  const [name, setName] = useState('')
  const [format, setFormat] = useState<TournamentFormat>('single_elimination')
  const [scoringChoice, setScoringChoice] = useState(SCORING_OPTIONS[0].value)
  const [startsAt, setStartsAt] = useState('')
  const [venueOrganizerId, setVenueOrganizerId] = useState<number | ''>('')
  const [livestreamOrganizerId, setLivestreamOrganizerId] = useState<number | ''>('')
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const selectedSportName = sports?.find((s) => s.id === sportId)?.name
  const availableFormats = (selectedSportName && SPORT_FORMATS[selectedSportName]) || ALL_FORMATS

  const { data: sportFormats } = useQuery({
    queryKey: ['sport-formats', sportId],
    queryFn: () => fetchSportFormats(sportId ? Number(sportId) : undefined),
    enabled: !!sportId,
  })
  const teamFormats = (sportFormats ?? []).filter((f) => f.players_per_side > 1)
  const isTeamTournament = sportFormatId !== ''

  // Keep the selected bracket type valid whenever the sport changes to one
  // that doesn't offer it (e.g. switching from Badminton's Swiss option to
  // Pickleball, which doesn't have Swiss).
  useEffect(() => {
    if (!availableFormats.includes(format)) {
      setFormat(availableFormats[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportName])

  // Team tournaments only support single elimination for now — force it the
  // moment a team format is chosen, matching what the backend enforces.
  useEffect(() => {
    if (isTeamTournament) {
      setFormat('single_elimination')
    }
  }, [isTeamTournament])

  const scoring = SCORING_OPTIONS.find((s) => s.value === scoringChoice) ?? SCORING_OPTIONS[0]

  const createMutation = useMutation({
    mutationFn: () => createTournament({
      sport_id: Number(sportId),
      sport_format_id: sportFormatId ? Number(sportFormatId) : undefined,
      name,
      format,
      starts_at: new Date(startsAt).toISOString(),
      venue_organizer_id: venueOrganizerId ? Number(venueOrganizerId) : undefined,
      livestream_organizer_id: livestreamOrganizerId ? Number(livestreamOrganizerId) : undefined,
      scoring_type: scoring.scoringType,
      sets_to_win: scoring.setsToWin,
    }),
    onSuccess: (tournament) => {
      setCreatedId(tournament.id)
      setMessage(`Created "${tournament.name}" as a draft. Register players, then generate the bracket.`)
      queryClient.invalidateQueries({ queryKey: ['organizer', 'tournaments'] })
    },
  })

  const bracketMutation = useMutation({
    mutationFn: () => generateBracket(createdId!),
    onSuccess: () => {
      setMessage('Bracket generated!')
      queryClient.invalidateQueries({ queryKey: ['organizer', 'tournaments'] })
      queryClient.invalidateQueries({ queryKey: ['organizer', 'bracket', createdId] })
    },
    onError: () => setMessage('Could not generate bracket (does it already have one, or no players registered?).'),
  })

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonPrimary}>
        + Create tournament
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Create a tournament</h3>
        <button onClick={() => setOpen(false)} className="text-xs font-medium text-slate-500 hover:text-slate-700">
          Minimize
        </button>
      </div>

      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <div className={fieldGroup}>
          <label className={label}>Sport</label>
          <select
            value={sportId}
            onChange={(e) => {
              setSportId(e.target.value ? Number(e.target.value) : '')
              setSportFormatId('')
            }}
            className={select}
          >
            <option value="">Sport...</option>
            {sports?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className={fieldGroup}>
          <label className={label}>Team format</label>
          <select
            value={sportFormatId}
            onChange={(e) => setSportFormatId(e.target.value ? Number(e.target.value) : '')}
            disabled={!sportId}
            className={select}
          >
            <option value="">Individual (no team)</option>
            {teamFormats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.players_per_side} per side)
              </option>
            ))}
          </select>
          {sportId && teamFormats.length === 0 && (
            <p className="text-xs text-slate-400">This sport has no multi-player formats.</p>
          )}
        </div>
        <div className={fieldGroup}>
          <label className={label}>Bracket type</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as TournamentFormat)}
            disabled={isTeamTournament}
            className={select}
          >
            {(isTeamTournament ? (['single_elimination'] as TournamentFormat[]) : availableFormats).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
          {isTeamTournament ? (
            <p className="text-xs text-slate-500">Team tournaments only support single elimination for now.</p>
          ) : (
            selectedSportName &&
            FORMAT_NOTES[selectedSportName]?.[format] && (
              <p className="text-xs text-slate-500">{FORMAT_NOTES[selectedSportName][format]}</p>
            )
          )}
        </div>
        <div className={`${fieldGroup} sm:col-span-2`}>
          <label className={label}>Tournament name</label>
          <input
            type="text"
            placeholder="Tournament name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input}
          />
        </div>
        <div className={fieldGroup}>
          <label className={label}>Starts at</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={input}
          />
        </div>
        <div className={fieldGroup}>
          <label className={label}>Match scoring</label>
          <select value={scoringChoice} onChange={(e) => setScoringChoice(e.target.value)} className={select}>
            {SCORING_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className={fieldGroup}>
          <label className={label}>Venue organizer (scoreboard) *</label>
          <select
            value={venueOrganizerId}
            onChange={(e) => setVenueOrganizerId(e.target.value ? Number(e.target.value) : '')}
            className={select}
          >
            <option value="">Choose a venue organizer...</option>
            {organizers?.venue_organizers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {organizers && organizers.venue_organizers.length === 0 && (
            <p className="text-xs text-red-600">
              No venue organizer accounts exist yet — ask an admin to create one before you can create a tournament.
            </p>
          )}
          <p className="text-xs text-slate-500">
            Required — scoring is always run by the venue organizer you assign here, not by you.
          </p>
        </div>
        <div className={fieldGroup}>
          <label className={label}>Livestream organizer *</label>
          <select
            value={livestreamOrganizerId}
            onChange={(e) => setLivestreamOrganizerId(e.target.value ? Number(e.target.value) : '')}
            className={select}
          >
            <option value="">Choose a livestream organizer...</option>
            {organizers?.livestream_organizers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {organizers && organizers.livestream_organizers.length === 0 && (
            <p className="text-xs text-red-600">
              No livestream organizer accounts exist yet — ask an admin to create one before you can create a
              tournament.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => createMutation.mutate()}
          disabled={!sportId || !name || !startsAt || !venueOrganizerId || !livestreamOrganizerId || createMutation.isPending}
          className={buttonPrimary}
        >
          {createMutation.isPending ? 'Creating...' : 'Create tournament'}
        </button>

        {createdId && (
          <button
            onClick={() => bracketMutation.mutate()}
            disabled={bracketMutation.isPending}
            className={buttonSuccess}
          >
            {bracketMutation.isPending ? 'Generating...' : `Generate bracket for tournament #${createdId}`}
          </button>
        )}
      </div>

      {message && <p className="text-sm text-slate-600">{message}</p>}
    </div>
  )
}
