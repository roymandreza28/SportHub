import { useEffect, useRef, useState } from 'react'
import { sendPublicSignal, type PublicSignalType } from '../../lib/publicSignalApi'
import { echo } from '../../lib/echo'
import { ICE_SERVERS } from '../../lib/webrtc'
import { buttonPrimary } from '../../lib/formStyles'

type PublicSignalMessage = {
  from_token: string
  target_token: string
  type: PublicSignalType
  data: Record<string, unknown>
}

// Hop 2's viewer side — used identically by both audience tiers: the
// authenticated Newsfeed (players/coaches, who also get comment/react UI
// alongside this) and the fully public/anonymous tabloid news modal on the
// landing page. Never needs auth: it just announces a random token on the
// livestream's public signal channel and waits for the main organizer's
// relay (LivestreamViewer.tsx) to offer it a peer connection.
//
// Once the broadcast has ended there's no one left to answer that signal —
// status/recordingUrl let this fall back to plain <video> playback of the
// broadcaster's own MediaRecorder capture (see LivestreamBroadcast.tsx)
// instead of hanging on "Connecting..." forever.
export function LiveRelayVideo({
  livestreamId,
  status,
  recordingUrl,
}: {
  livestreamId: number
  status?: 'scheduled' | 'live' | 'ended'
  recordingUrl?: string | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const tokenRef = useRef<string>(crypto.randomUUID())
  const [connected, setConnected] = useState(false)
  const [needsPlayClick, setNeedsPlayClick] = useState(false)
  const isEnded = status === 'ended'

  useEffect(() => {
    if (isEnded) return
    const myToken = tokenRef.current

    async function handleOffer(message: PublicSignalMessage) {
      pcRef.current?.close()

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc

      pc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0]
          videoRef.current.play().catch(() => setNeedsPlayClick(true))
        }
        setConnected(true)
      }
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendPublicSignal(livestreamId, myToken, 'organizer', 'ice-candidate', event.candidate.toJSON())
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(message.data as unknown as RTCSessionDescriptionInit))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await sendPublicSignal(livestreamId, myToken, 'organizer', 'answer', { sdp: answer.sdp, type: answer.type })
    }

    const channel = echo.channel(`livestream.${livestreamId}.public-signal`)
    channel.listen('.PublicSignal', (message: PublicSignalMessage) => {
      if (message.target_token !== myToken) return

      if (message.type === 'offer') {
        handleOffer(message).catch(() => setConnected(false))
      } else if (message.type === 'ice-candidate') {
        pcRef.current?.addIceCandidate(new RTCIceCandidate(message.data as RTCIceCandidateInit))
      }
    })

    sendPublicSignal(livestreamId, myToken, 'organizer', 'join', {})

    return () => {
      echo.leave(`livestream.${livestreamId}.public-signal`)
      pcRef.current?.close()
      pcRef.current = null
    }
    // isEnded included so a broadcast ending while this is already mounted
    // tears down the live-connection attempt instead of leaving it hanging.
  }, [livestreamId, isEnded])

  if (isEnded) {
    if (!recordingUrl) {
      return (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-950 text-sm text-pure-white/70">
          This broadcast has ended — no recording was saved.
        </div>
      )
    }

    return (
      <video
        controls
        playsInline
        src={recordingUrl}
        className="aspect-video w-full rounded-lg border border-slate-200 bg-slate-950"
      />
    )
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
      <video ref={videoRef} autoPlay playsInline className="h-full w-full" />
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-pure-white/70">
          Connecting to the live broadcast...
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
  )
}
