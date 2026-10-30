import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchTournaments,
  registerPlayersForTournament,
  type PaymentReceipt,
  type PlayerSearchResult,
} from '../../lib/coachApi'
import { formatPeso } from '../../lib/venueApi'
import { PlayerSearchPicker } from './PlayerSearchPicker'
import { TournamentPaymentReceipt } from './TournamentPaymentReceipt'
import { useAuth } from '../../lib/AuthContext'
import { buttonPrimary, fieldGroup, label, select } from '../../lib/formStyles'

export function TournamentRegistrationForm({
  tournamentId: fixedTournamentId,
  onRegistered,
}: { tournamentId?: number; onRegistered?: () => void } = {}) {
  const { user } = useAuth()
  const isVerified = user?.verification_status === 'verified'
  const { data: tournaments } = useQuery({
    queryKey: ['tournaments', 'registration'],
    queryFn: () => fetchTournaments('registration'),
    enabled: !fixedTournamentId,
  })
  const [tournamentId, setTournamentId] = useState<number | ''>(fixedTournamentId ?? '')
  const selectedTournament = tournaments?.find((t) => t.id === tournamentId)
  const [players, setPlayers] = useState<PlayerSearchResult[]>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null)
  const queryClient = useQueryClient()

  const totalFee = useMemo(() => {
    if (!selectedTournament?.registration_fee || players.length === 0) return 0
    return Number(selectedTournament.registration_fee) * players.length
  }, [players.length, selectedTournament?.registration_fee])

  const formatTournamentLabel = (t: { name: string; sport: { name: string }; required_gender?: string | null; min_age?: number | null; max_age?: number | null }) => {
    const baseName = t.name.length > 48 ? `${t.name.slice(0, 45)}...` : t.name
    const sportInfo = t.sport.name
    const genderInfo = t.required_gender ? `, ${t.required_gender} only` : ''
    const ageInfo = t.min_age !== null || t.max_age !== null ? `, ages ${t.min_age ?? 'Any'}-${t.max_age ?? 'Any'}` : ''
    return `${baseName} (${sportInfo}${genderInfo}${ageInfo})`
  }

  const mutation = useMutation({
    mutationFn: () => registerPlayersForTournament(Number(tournamentId), players.map((player) => player.id)),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['coach', 'tournament-registrations', 'mine'] })
      if (data.payment_receipt) {
        setReceipt(data.payment_receipt)
      } else {
        const playerNames = players.map((player) => player.name).join(', ')
        setMessage({ type: 'success', text: `Registered ${playerNames}.` })
        setPlayers([])
        onRegistered?.()
      }
    },
    onError: (err: unknown) => {
      const text =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not register the selected players.'
      setMessage({ type: 'error', text })
    },
  })

  if (receipt) {
    return <TournamentPaymentReceipt receipt={receipt} onDone={() => onRegistered?.()} />
  }

  return (
    <div className="flex w-full max-w-full flex-col gap-4">
      {!fixedTournamentId && (
        <div className={fieldGroup}>
          <label className={label}>Tournament</label>
          <select
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value ? Number(e.target.value) : '')}
            className={select}
          >
            <option value="">Choose a tournament...</option>
            {tournaments?.map((t) => (
              <option key={t.id} value={t.id}>
                {formatTournamentLabel(t)}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedTournament && (selectedTournament.required_gender || selectedTournament.min_age !== null || selectedTournament.max_age !== null) && (
        <p className="text-xs text-slate-500">
          {selectedTournament?.required_gender && (
            <>
              This tournament is restricted to <strong>{selectedTournament.required_gender}</strong> players.
            </>
          )}
          {(selectedTournament?.min_age !== null || selectedTournament?.max_age !== null) && (
            <>
              {selectedTournament?.required_gender ? ' ' : 'This tournament is '}open to ages{' '}
              <strong>{selectedTournament?.min_age ?? 'Any'}</strong> to <strong>{selectedTournament?.max_age ?? 'Any'}</strong>.
            </>
          )}
        </p>
      )}

      <div className={fieldGroup}>
        <label className={label}>Players</label>
        <PlayerSearchPicker selected={players} onSelect={setPlayers} />
      </div>

      {selectedTournament?.registration_fee && players.length > 0 && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          <div className="flex items-center justify-between gap-3">
            <span>Selected player(s)</span>
            <span className="font-semibold">{players.length}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span>Registration total</span>
            <span className="font-semibold">{formatPeso(totalFee)}</span>
          </div>
        </div>
      )}

      <button
        onClick={() => mutation.mutate()}
        disabled={!isVerified || !tournamentId || players.length === 0 || mutation.isPending}
        className={`${buttonPrimary} self-start`}
      >
        {mutation.isPending ? 'Registering...' : `Register ${players.length} player${players.length === 1 ? '' : 's'}`}
      </button>
      {!isVerified && (
        <p className="text-xs text-amber-700">Tournament registration is unavailable until your account is verified.</p>
      )}

      {message && (
        <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>
      )}
    </div>
  )
}
