import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLivestream, sendWebRTCSignal, uploadLivestreamRecording, type LivestreamItem } from '../../lib/organizerApi'
import { sendPublicSignal, type PublicSignalType } from '../../lib/publicSignalApi'
import { useAuth } from '../../lib/AuthContext'
import { echo } from '../../lib/echo'
import { ICE_SERVERS } from '../../lib/webrtc'
import { buttonDanger, buttonPrimary } from '../../lib/formStyles'

// There's no server-side media pipeline anywhere in this app's WebRTC relay
// (LivestreamBroadcast -> LivestreamViewer -> LiveRelayVideo is pure
// browser-to-browser signaling) — the broadcaster's own device recording
// its outgoing stream as it goes is the only way a "watch it later" copy
// can exist at all. Picks the first format the browser actually supports
// rather than hardcoding one, since exact codec support varies (Chrome:
// vp9/vp8 webm; Safari: mp4).
function pickRecorderMimeType(): string | undefined {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

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

// Rendered for the livestream's own broadcaster — captures their device
// camera and fans it out to every connected viewer as a direct peer
// connection (mesh topology, no media server). See web/src/lib/webrtc.ts
// for the STUN-only/no-TURN tradeoff this implies.
export function LivestreamBroadcast({ livestream }: { livestream: LivestreamItem }) {
  const { user } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Map<number, RTCPeerConnection>>(new Map())
  const publicPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const isLiveRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const [isLive, setIsLive] = useState(livestream.status === 'live')
  const [error, setError] = useState<string | null>(null)
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'upload-failed'>('idle')

  useEffect(() => {
    isLiveRef.current = isLive
  }, [isLive])

  // The main organizer publishes from their OWN device/session — there's no
  // shared query cache to react to, so this is how the broadcaster's own
  // browser finds out news_id just got set (i.e. it's time to start
  // answering public viewers directly) without needing a page reload.
  const { data: liveLivestream } = useQuery({
    queryKey: ['livestream', livestream.id, 'poll'],
    queryFn: () => fetchLivestream(livestream.id),
    enabled: isLive,
    refetchInterval: 3000,
  })
  const newsId = liveLivestream?.news_id ?? livestream.news_id

  function createPeerFor(viewerId: number): RTCPeerConnection {
    const existing = peersRef.current.get(viewerId)
    if (existing) return existing

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    streamRef.current?.getTracks().forEach((track) => pc.addTrack(track, streamRef.current!))
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWebRTCSignal(livestream.id, viewerId, 'ice-candidate', event.candidate.toJSON())
      }
    }
    peersRef.current.set(viewerId, pc)
    return pc
  }

  async function offerTo(viewerId: number) {
    const pc = createPeerFor(viewerId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await sendWebRTCSignal(livestream.id, viewerId, 'offer', { sdp: offer.sdp, type: offer.type })
  }

  async function startBroadcast() {
    setError(null)
    setRecordingStatus('idle')
    try {
      // `ideal` (not `exact`) so this is a preference, not a requirement —
      // a phone/tablet with a rear camera opens on it instead of the
      // front-facing one (much more useful for broadcasting a game a
      // livestream organizer is standing courtside for), while a laptop
      // with a single front-facing webcam and no facingMode metadata at
      // all just ignores the hint and opens normally.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream

      // Records the exact same outgoing stream every viewer's peer
      // connection is fed from — recording is best-effort: a browser with
      // no MediaRecorder support (rare) still broadcasts live fine, it just
      // won't have a replay afterward.
      recordedChunksRef.current = []
      if (typeof MediaRecorder !== 'undefined') {
        const mimeType = pickRecorderMimeType()
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) recordedChunksRef.current.push(event.data)
        }
        recorder.start(1000)
        recorderRef.current = recorder
      }

      await sendWebRTCSignal(livestream.id, user!.id, 'broadcast-started', {})
      setIsLive(true)
    } catch {
      setError('Could not access your camera/microphone. Check your browser permissions.')
    }
  }

  async function stopBroadcast() {
    peersRef.current.forEach((pc) => pc.close())
    peersRef.current.clear()
    publicPeersRef.current.forEach((pc) => pc.close())
    publicPeersRef.current.clear()

    const recorder = recorderRef.current
    recorderRef.current = null
    const recordingDone = new Promise<Blob | null>((resolve) => {
      if (!recorder || recorder.state === 'inactive') {
        resolve(null)
        return
      }
      recorder.onstop = () => resolve(new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' }))
      recorder.stop()
    })

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    await sendWebRTCSignal(livestream.id, user!.id, 'broadcast-ended', {})
    setIsLive(false)

    const recording = await recordingDone
    recordedChunksRef.current = []
    if (!recording || recording.size === 0) return

    setRecordingStatus('uploading')
    try {
      const extension = recording.type.includes('mp4') ? 'mp4' : 'webm'
      await uploadLivestreamRecording(livestream.id, recording, `broadcast-${livestream.id}.${extension}`)
      setRecordingStatus('uploaded')
    } catch {
      setRecordingStatus('upload-failed')
    }
  }

  // Subscribes exactly once per (livestream, user) — deliberately excludes
  // `isLive` so starting/stopping the broadcast never tears down and
  // re-creates this subscription (laravel-echo's PresenceChannel.joining()
  // has no matching "stop" callback to safely unwind mid-lifecycle; reading
  // isLiveRef inside the handler avoids ever needing one).
  useEffect(() => {
    if (!user) return

    // Reuses the same presence channel LivestreamChat (a sibling, mounted/
    // unmounted together with this component under the same selected-
    // livestream view) already joins for chat/viewer-count — Echo shares
    // one underlying subscription per channel name.
    const mainOrganizerId = livestream.tournament?.organizer_id
    const presenceChannel = echo.join(`livestream.${livestream.id}.chat`)
    presenceChannel.joining((member: { id: number; name: string }) => {
      // The livestream_organizer's only job is feeding the main organizer —
      // never anyone else who happens to join this presence channel (e.g. a
      // player browsing the tournament's Livestreams tab before it's
      // published to news). Idempotent by design, not just belt-and-
      // suspenders: laravel-echo's PresenceChannel.joining() has no matching
      // "stop" callback, so this handler can end up bound more than once for
      // the same member (React StrictMode double-invokes effects in dev).
      // Skipping when a peer connection already exists keeps a duplicate
      // firing harmless instead of corrupting the SDP with two concurrent
      // offers on the same RTCPeerConnection.
      if (isLiveRef.current && member.id === mainOrganizerId && !peersRef.current.has(member.id)) {
        offerTo(member.id).catch(() => setError('Failed to connect to a new viewer.'))
      }
    })

    const userChannel = echo.private(`App.Models.User.${user.id}`)
    const onSignal = (message: SignalMessage) => {
      if (message.livestream_id !== livestream.id) return
      const pc = peersRef.current.get(message.from_user_id)
      if (!pc) return

      if (message.type === 'answer') {
        pc.setRemoteDescription(new RTCSessionDescription(message.data as unknown as RTCSessionDescriptionInit))
      } else if (message.type === 'ice-candidate') {
        pc.addIceCandidate(new RTCIceCandidate(message.data as RTCIceCandidateInit))
      }
    }
    userChannel.listen('.WebRTCSignal', onSignal)

    return () => {
      userChannel.stopListening('.WebRTCSignal', onSignal)
      peersRef.current.forEach((pc) => pc.close())
      peersRef.current.clear()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livestream.id, user?.id])

  // Answers public/newsfeed viewers DIRECTLY off the same outgoing stream
  // every other peer connection above is fed from — once published, a
  // viewer never has to wait on a second decode/re-encode hop through the
  // main organizer's own browser (that's what LivestreamViewer.tsx used to
  // do; removed there once this took over) before seeing video. The
  // tradeoff is bandwidth, not latency: mesh topology (same as hop 1 above)
  // means this device now uploads one full copy of the stream per viewer —
  // fine for the small audiences this app expects, not a fit for a large
  // one, which would need a media relay server instead.
  useEffect(() => {
    if (!isLive || !newsId) return

    function createPublicPeerFor(viewerToken: string): RTCPeerConnection {
      const existing = publicPeersRef.current.get(viewerToken)
      if (existing) return existing

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      streamRef.current?.getTracks().forEach((track) => pc.addTrack(track, streamRef.current!))
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendPublicSignal(livestream.id, 'broadcaster', viewerToken, 'ice-candidate', event.candidate.toJSON())
        }
      }
      publicPeersRef.current.set(viewerToken, pc)
      return pc
    }

    async function offerToPublicViewer(viewerToken: string) {
      const pc = createPublicPeerFor(viewerToken)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await sendPublicSignal(livestream.id, 'broadcaster', viewerToken, 'offer', { sdp: offer.sdp, type: offer.type })
    }

    const channel = echo.channel(`livestream.${livestream.id}.public-signal`)
    channel.listen('.PublicSignal', (message: PublicSignalMessage) => {
      if (message.target_token !== 'broadcaster') return

      if (message.type === 'join' && !publicPeersRef.current.has(message.from_token)) {
        offerToPublicViewer(message.from_token).catch(() => {})
      } else if (message.type === 'answer') {
        publicPeersRef.current
          .get(message.from_token)
          ?.setRemoteDescription(new RTCSessionDescription(message.data as unknown as RTCSessionDescriptionInit))
      } else if (message.type === 'ice-candidate') {
        publicPeersRef.current.get(message.from_token)?.addIceCandidate(new RTCIceCandidate(message.data as RTCIceCandidateInit))
      }
    })

    return () => {
      echo.leave(`livestream.${livestream.id}.public-signal`)
      publicPeersRef.current.forEach((pc) => pc.close())
      publicPeersRef.current.clear()
    }
  }, [livestream.id, isLive, newsId])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{livestream.title}</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[livestream.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {isLive ? 'live' : livestream.status}
        </span>
      </div>

      <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full rounded-lg border border-slate-200 bg-slate-950" />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {recordingStatus === 'uploading' && (
        <p className="text-xs text-slate-500">Saving the recording so viewers can rewatch it later...</p>
      )}
      {recordingStatus === 'uploaded' && (
        <p className="text-xs text-teal-700">Recording saved — viewers can rewatch this broadcast once it's over.</p>
      )}
      {recordingStatus === 'upload-failed' && (
        <p className="text-xs text-red-600">Couldn't save the recording — the live broadcast itself was unaffected.</p>
      )}

      {isLive ? (
        <button onClick={stopBroadcast} className={`${buttonDanger} self-start`}>
          Stop broadcast
        </button>
      ) : (
        <button onClick={startBroadcast} disabled={recordingStatus === 'uploading'} className={`${buttonPrimary} self-start`}>
          Start broadcast
        </button>
      )}
    </div>
  )
}
