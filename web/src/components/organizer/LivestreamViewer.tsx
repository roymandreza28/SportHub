import { useEffect, useRef, useState } from 'react'
import { sendWebRTCSignal, type LivestreamItem } from '../../lib/organizerApi'
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

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-500',
  live: 'bg-red-100 text-red-700',
  ended: 'bg-slate-100 text-slate-500',
}

// Rendered for the tournament's main organizer — a preview of the
// livestream_organizer's camera feed, and the "publish to the newsfeed"
// gate. Used to also relay that feed onward to every public/newsfeed
// viewer (a second WebRTC hop through this browser tab), which meant a
// full decode+re-encode of the video happening here on top of whatever
// delay hop 1 already had. LivestreamBroadcast.tsx now answers public
// viewers directly off its own outgoing stream instead, cutting that hop
// out entirely — this component is purely a preview + publish control now.
export function LivestreamViewer({ livestream }: { livestream: LivestreamItem }) {
  const { user } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const [connected, setConnected] = useState(false)
  const [ended, setEnded] = useState(livestream.status === 'ended')
  const [newsId, setNewsId] = useState<number | null>(livestream.news_id)
  // Chrome (and other browsers) block autoplay of an unmuted <video> until
  // there's been a user gesture on the page — the peer connection can be
  // fully live with frames arriving while playback itself stays blocked.
  const [needsPlayClick, setNeedsPlayClick] = useState(false)

  const isMainOrganizer = user?.id === livestream.tournament?.organizer_id

  // Receives the livestream_organizer's feed, for the main organizer's own
  // preview before (and after) deciding to publish it to the newsfeed.
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

      await pc.setRemoteDescription(new RTCSessionDescription(message.data as unknown as RTCSessionDescriptionInit))
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

      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
        <video ref={videoRef} autoPlay playsInline className="h-full w-full" />
        {!connected && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-pure-white/70">
            {ended
              ? 'This broadcast has ended.'
              : `Waiting for ${livestream.broadcaster?.name ?? 'the broadcaster'} to start...`}
          </div>
        )}
        {connected && needsPlayClick && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60">
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
