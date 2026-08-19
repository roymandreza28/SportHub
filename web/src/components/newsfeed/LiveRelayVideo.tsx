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
export function LiveRelayVideo({ livestreamId }: { livestreamId: number }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const tokenRef = useRef<string>(crypto.randomUUID())
  const [connected, setConnected] = useState(false)
  const [needsPlayClick, setNeedsPlayClick] = useState(false)

  useEffect(() => {
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
  }, [livestreamId])

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
      <video ref={videoRef} autoPlay playsInline className="h-full w-full" />
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
          Connecting to the live broadcast...
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
  )
}
