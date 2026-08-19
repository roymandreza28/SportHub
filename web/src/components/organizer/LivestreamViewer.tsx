import { useEffect, useRef, useState } from 'react'
import { sendWebRTCSignal, type LivestreamItem } from '../../lib/organizerApi'
import { sendPublicSignal, type PublicSignalType } from '../../lib/publicSignalApi'
import { useAuth } from '../../lib/AuthContext'
import { echo } from '../../lib/echo'
import { ICE_SERVERS } from '../../lib/webrtc'
import { buttonPrimary } from '../../lib/formStyles'
import { LivestreamPublishForm } from './LivestreamPublishForm'

type SignalMessage = {
  livestream_id: number
  from_user_id: number
  from_user_name: string
  type: 'offer' | 'answer' | 'ice-candidate' | 'broadcast-started' | 'broadcast-ended'
  data: Record<string, unknown>
}

type PublicSignalMessage = {
  from_token: string
  target_token: string
  type: PublicSignalType
  data: Record<string, unknown>
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-500',
  live: 'bg-red-100 text-red-700',
  ended: 'bg-slate-100 text-slate-500',
}

// Rendered for the tournament's main organizer — this is both halves of the
// relay's middle hop: it RECEIVES the livestream_organizer's camera feed
// (hop 1, unchanged from before) and, once published to the newsfeed, RE-
// BROADCASTS that same feed onward to every newsfeed viewer (hop 2, new) —
// logged-in or fully anonymous, via LiveRelayVideo.tsx on the other end.
export function LivestreamViewer({ livestream }: { livestream: LivestreamItem }) {
  const { user } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const relayPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const [connected, setConnected] = useState(false)
  const [ended, setEnded] = useState(livestream.status === 'ended')
  const [newsId, setNewsId] = useState<number | null>(livestream.news_id)
  // Chrome (and other browsers) block autoplay of an unmuted <video> until
  // there's been a user gesture on the page — the peer connection can be
  // fully live with frames arriving while playback itself stays blocked.
  const [needsPlayClick, setNeedsPlayClick] = useState(false)

  const isMainOrganizer = user?.id === livestream.tournament?.organizer_id

  // --- Hop 1: receive the livestream_organizer's feed (unchanged logic) ---
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
        remoteStreamRef.current = event.streams[0]
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
        remoteStreamRef.current = null
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

  // --- Hop 2: once published, relay the received feed to newsfeed viewers ---
  useEffect(() => {
    if (!newsId) return

    function createRelayPeerFor(viewerToken: string): RTCPeerConnection {
      const existing = relayPeersRef.current.get(viewerToken)
      if (existing) return existing

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      remoteStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, remoteStreamRef.current!))
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendPublicSignal(livestream.id, 'organizer', viewerToken, 'ice-candidate', event.candidate.toJSON())
        }
      }
      relayPeersRef.current.set(viewerToken, pc)
      return pc
    }

    async function offerTo(viewerToken: string) {
      const pc = createRelayPeerFor(viewerToken)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await sendPublicSignal(livestream.id, 'organizer', viewerToken, 'offer', { sdp: offer.sdp, type: offer.type })
    }

    const channel = echo.channel(`livestream.${livestream.id}.public-signal`)
    channel.listen('.PublicSignal', (message: PublicSignalMessage) => {
      if (message.target_token !== 'organizer') return

      if (message.type === 'join' && !relayPeersRef.current.has(message.from_token)) {
        offerTo(message.from_token).catch(() => {})
      } else if (message.type === 'answer') {
        relayPeersRef.current
          .get(message.from_token)
          ?.setRemoteDescription(new RTCSessionDescription(message.data as RTCSessionDescriptionInit))
      } else if (message.type === 'ice-candidate') {
        relayPeersRef.current.get(message.from_token)?.addIceCandidate(new RTCIceCandidate(message.data as RTCIceCandidateInit))
      }
    })

    return () => {
      echo.leave(`livestream.${livestream.id}.public-signal`)
      relayPeersRef.current.forEach((pc) => pc.close())
      relayPeersRef.current.clear()
    }
  }, [livestream.id, newsId])

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

      {isMainOrganizer && connected && !newsId && (
        <LivestreamPublishForm livestreamId={livestream.id} onPublished={setNewsId} />
      )}
      {isMainOrganizer && newsId && (
        <p className="text-xs text-teal-700">
          Live on the newsfeed — every logged-in user and the public landing page can watch.
        </p>
      )}
    </div>
  )
}
