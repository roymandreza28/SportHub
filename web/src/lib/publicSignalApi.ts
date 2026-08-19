import { api } from './api'

export type PublicSignalType = 'join' | 'offer' | 'answer' | 'ice-candidate'

// Hop 2 of the livestream relay — deliberately callable by anonymous
// visitors (the public tabloid news modal), so this never assumes an
// Authorization header is present. See LivestreamController::publicSignal().
export async function sendPublicSignal(
  livestreamId: number,
  fromToken: string,
  targetToken: string,
  type: PublicSignalType,
  data: object
) {
  await api.post(`/api/livestreams/${livestreamId}/public-signal`, {
    from_token: fromToken,
    target_token: targetToken,
    type,
    data,
  })
}
