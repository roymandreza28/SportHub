import { useEffect, useRef, useState } from 'react'
import { sendWebRTCSignal, type LivestreamItem } from '../../lib/organizerApi'
import { useAuth } from '../../lib/AuthContext'
import { echo } from '../../lib/echo'
import { ICE_SERVERS } from '../../lib/webrtc'
import { buttonPrimary } from '../../lib/formStyles'

type SignalMessage = {
  livestream_id: number
  from_user_id: number
  from_user_name: string
  type: 'offer' | 'answer' | 'ice-candidate' | 'broadcast-started' | 'broadcast-ended'
  data: Record<string, unknown>
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-500',
  live: 'bg-red-100 text-red-700',
  ended: 'bg-slate-100 text-slate-500',
}

// Rendered for anyone watching who is NOT the livestream's broadcaster —
// receives the broadcaster's camera feed as a direct peer connection. See
// LivestreamBroadcast.tsx for the offer/answer/ICE-candidate flow this
// mirrors from the other side.
export function LivestreamViewer({ livestream }: { livestream: LivestreamItem }) {
  const { user } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const [connected, setConnected] = useState(false)
  const [ended, setEnded] = useState(livestream.status === 'ended')
  // Chrome (and other browsers) block autoplay of an unmuted <video> until
  // there's been a user gesture on the page — the peer connection can be
  // fully live with frames arriving while playback itself stays blocked.
  const [needsPlayClick, setNeedsPlayClick] = useState(false)

  useEffect(() => {
    if (!user) return

    async function handleOffer(message: SignalMessage) {
      pcRef.current?.close()

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      // Assigned immediately, before the async SDP exchange below — an ICE
      // candidate signal from the broadcaster can otherwise arrive and be
      // silently dropped by onSignal's `pcRef.current?.addIceCandidate(...)`
      // while this is still null.
      pcRef.current = pc

      pc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0]
          videoRef.current.play().catch(() => setNeedsPlayClick(true))
        }
        setConnected(true)
        setEnded(false)
      }
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendWebRTCSignal(livestream.id, message.from_user_id, 'ice-candidate', event.candidate.toJSON())
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(message.data as RTCSessionDescriptionInit))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await sendWebRTCSignal(livestream.id, message.from_user_id, 'answer', { sdp: answer.sdp, type: answer.type })
    }

    const userChannel = echo.private(`App.Models.User.${user.id}`)
    const onSignal = (message: SignalMessage) => {
      if (message.livestream_id !== livestream.id) return

      if (message.type === 'offer') {
        handleOffer(message).catch(() => setConnected(false))
      } else if (message.type === 'ice-candidate') {
        pcRef.current?.addIceCandidate(new RTCIceCandidate(message.data as RTCIceCandidateInit))
      } else if (message.type === 'broadcast-ended') {
        pcRef.current?.close()
        pcRef.current = null
        if (videoRef.current) videoRef.current.srcObject = null
        setConnected(false)
        setNeedsPlayClick(false)
        setEnded(true)
      }
    }
    userChannel.listen('.WebRTCSignal', onSignal)

    return () => {
      userChannel.stopListening('.WebRTCSignal', onSignal)
      pcRef.current?.close()
      pcRef.current = null
    }
  }, [livestream.id, user?.id])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{livestream.title}</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[livestream.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {livestream.status}
        </span>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
        <video ref={videoRef} autoPlay playsInline className="h-full w-full" />
        {!connected && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
            {ended
              ? 'This broadcast has ended.'
              : `Waiting for ${livestream.broadcaster?.name ?? 'the broadcaster'} to start...`}
          </div>
        )}
        {connected && needsPlayClick && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
            <button
              onClick={() => videoRef.current?.play().then(() => setNeedsPlayClick(false))}
              className={buttonPrimary}
            >
              Click to watch
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
