import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchLivestream, sendWebRTCSignal, uploadLivestreamRecording, type LivestreamItem } from '../../lib/organizerApi'
import { sendPublicSignal, type PublicSignalType } from '../../lib/publicSignalApi'
import { useAuth } from '../../lib/AuthContext'
import { echo } from '../../lib/echo'
import { ICE_SERVERS } from '../../lib/webrtc'
import { buttonDanger, buttonPrimary } from '../../lib/formStyles'
import { IconCameraSwitch } from '../layout/icons'

// Biases capture toward a landscape resolution instead of whatever the
// device's default orientation happens to produce — a phone held upright
// still asks the camera hardware for a 16:9-shaped feed (the sensor itself
// is landscape-native regardless of how the phone is held), so both the
// broadcaster's own preview and what every viewer receives stay in
// landscape format rather than being squeezed portrait video.
const LANDSCAPE_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  aspectRatio: { ideal: 16 / 9 },
}

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
//
// Once live, this takes over the whole screen (portaled to document.body,
// same reasoning as every other full-viewport overlay in this app —
// escaping whatever small box happens to contain it, e.g. a match-scoring
// page) rather than staying an inline embed: organizer, venue facilitator,
// and livestream organizer all start a broadcast from a fairly cramped
// screen (the Livestreams tab, or a corner LivestreamMiniWindow docked over
// live scoring), and a camera feed that small isn't usable for actually
// operating the broadcast. `onLiveChange` lets a parent that supplies its
// own small-box chrome (LivestreamMiniWindow) know to get out of the way
// once this is rendering itself full-screen, instead of the two
// overlapping.
export function LivestreamBroadcast({
  livestream,
  onLiveChange,
}: {
  livestream: LivestreamItem
  onLiveChange?: (isLive: boolean) => void
}) {
  const { user } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  // The actual camera+mic device stream — kept separate from outputStreamRef
  // so the real camera track can always be found and stopped (releasing the
  // hardware) regardless of whether it's also the thing being sent, or has
  // been swapped out for a rotated stand-in (see getLandscapeVideoTrack).
  const rawStreamRef = useRef<MediaStream | null>(null)
  // What every peer connection, the MediaRecorder, and the local preview
  // actually use — identical to rawStreamRef when the captured video is
  // already landscape-shaped, otherwise the raw video track is swapped for
  // a canvas-rotated one (still the same audio track either way).
  const outputStreamRef = useRef<MediaStream | null>(null)
  // Off-DOM helpers for the rotation pipeline — never appended anywhere,
  // srcObject/captureStream work fine on a detached element.
  const hiddenVideoElRef = useRef<HTMLVideoElement | null>(null)
  const rotationCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const rotationFrameRef = useRef<number | null>(null)
  const peersRef = useRef<Map<number, RTCPeerConnection>>(new Map())
  const publicPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const isLiveRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const [isLive, setIsLive] = useState(livestream.status === 'live')
  const [minimized, setMinimized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'upload-failed'>('idle')
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [switchingCamera, setSwitchingCamera] = useState(false)

  useEffect(() => {
    isLiveRef.current = isLive
    onLiveChange?.(isLive)
  }, [isLive, onLiveChange])

  // The <video> element itself is a different DOM node in each of the three
  // render branches below (not-live inline, live full-screen, live
  // minimized) — React mounts a fresh one on every switch, and srcObject is
  // an imperative DOM property React doesn't carry across that for us, so
  // it has to be reattached by hand once the newly-mounted element exists.
  useEffect(() => {
    if (videoRef.current && outputStreamRef.current) {
      videoRef.current.srcObject = outputStreamRef.current
    }
  }, [isLive, minimized])

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
    outputStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, outputStreamRef.current!))
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

  function stopRotationPipeline() {
    if (rotationFrameRef.current != null) {
      cancelAnimationFrame(rotationFrameRef.current)
      rotationFrameRef.current = null
    }
    if (hiddenVideoElRef.current) {
      hiddenVideoElRef.current.pause()
      hiddenVideoElRef.current.srcObject = null
    }
  }

  // A phone's rear camera sensor is mounted landscape-native, but most
  // mobile browsers still hand back a genuinely portrait-shaped frame
  // buffer (tall pixels, not just a tall <video> box) when the phone is
  // held upright — `LANDSCAPE_VIDEO_CONSTRAINTS` above is only an `ideal`
  // hint and plenty of devices ignore it outright. That portrait buffer is
  // what would actually reach every viewer over WebRTC, so fixing the
  // broadcaster's own on-screen CSS isn't enough — the outgoing track
  // itself has to be landscape. When the raw track really is portrait, this
  // draws it rotated 90° onto an off-DOM canvas every frame and returns
  // canvas.captureStream()'s video track instead, so what's actually sent
  // (and recorded, and previewed) is landscape regardless of device
  // orientation. Already-landscape input (most webcams, or a phone that
  // does report correctly) is returned untouched — no canvas/CPU cost.
  async function getLandscapeVideoTrack(rawTrack: MediaStreamTrack): Promise<MediaStreamTrack> {
    stopRotationPipeline()

    if (!hiddenVideoElRef.current) {
      const el = document.createElement('video')
      el.muted = true
      el.playsInline = true
      hiddenVideoElRef.current = el
    }
    const hiddenVideo = hiddenVideoElRef.current
    hiddenVideo.srcObject = new MediaStream([rawTrack])

    await new Promise<void>((resolve) => {
      if (hiddenVideo.readyState >= 1) {
        resolve()
        return
      }
      hiddenVideo.onloadedmetadata = () => resolve()
    })
    await hiddenVideo.play().catch(() => {})

    const w = hiddenVideo.videoWidth
    const h = hiddenVideo.videoHeight
    if (!w || !h || w >= h) {
      // Already landscape (or dimensions unavailable) — use the camera
      // track as-is.
      hiddenVideo.srcObject = null
      return rawTrack
    }

    if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      // No canvas-capture support (very old browser) — best-effort, ship
      // the portrait track rather than nothing.
      return rawTrack
    }

    if (!rotationCanvasRef.current) rotationCanvasRef.current = document.createElement('canvas')
    const canvas = rotationCanvasRef.current
    canvas.width = h
    canvas.height = w
    const ctx = canvas.getContext('2d')
    if (!ctx) return rawTrack

    const draw = () => {
      ctx.save()
      ctx.translate(canvas.width, 0)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(hiddenVideo, 0, 0, w, h)
      ctx.restore()
      rotationFrameRef.current = requestAnimationFrame(draw)
    }
    draw()

    return canvas.captureStream(30).getVideoTracks()[0]
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
        video: { facingMode: { ideal: 'environment' }, ...LANDSCAPE_VIDEO_CONSTRAINTS },
        audio: true,
      })
      rawStreamRef.current = stream

      const landscapeTrack = await getLandscapeVideoTrack(stream.getVideoTracks()[0])
      const output = new MediaStream([landscapeTrack, ...stream.getAudioTracks()])
      outputStreamRef.current = output
      if (videoRef.current) videoRef.current.srcObject = output

      // Device labels are only populated once permission has been granted,
      // so this is the earliest point a "switch camera" control can know
      // whether the broadcaster actually has more than one camera to offer.
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        setVideoDevices(devices.filter((d) => d.kind === 'videoinput'))
      } catch {
        setVideoDevices([])
      }

      // Records the exact same outgoing stream every viewer's peer
      // connection is fed from (post-rotation, if any) — recording is
      // best-effort: a browser with no MediaRecorder support (rare) still
      // broadcasts live fine, it just won't have a replay afterward.
      recordedChunksRef.current = []
      if (typeof MediaRecorder !== 'undefined') {
        const mimeType = pickRecorderMimeType()
        const recorder = new MediaRecorder(output, mimeType ? { mimeType } : undefined)
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

  // Swaps the outgoing video track for the next camera on the device
  // (front/rear, or any other attached webcam) without tearing down and
  // re-offering to every connected peer — RTCRtpSender.replaceTrack() swaps
  // what a peer connection is already sending mid-call, so viewers keep
  // watching the same connection and just see the feed change. Runs the new
  // camera's raw track through the same landscape pipeline startBroadcast()
  // does, since a front camera or a different rear lens can report a
  // different native orientation than the one just switched away from.
  async function switchCamera() {
    const rawStream = rawStreamRef.current
    const output = outputStreamRef.current
    if (!rawStream || !output || videoDevices.length < 2 || switchingCamera) return

    const currentRawTrack = rawStream.getVideoTracks()[0]
    const currentDeviceId = currentRawTrack?.getSettings().deviceId
    const currentIndex = videoDevices.findIndex((d) => d.deviceId === currentDeviceId)
    const nextDevice = videoDevices[(currentIndex + 1) % videoDevices.length]

    setSwitchingCamera(true)
    try {
      const newRawStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextDevice.deviceId }, ...LANDSCAPE_VIDEO_CONSTRAINTS },
        audio: false,
      })
      const newRawTrack = newRawStream.getVideoTracks()[0]
      const newLandscapeTrack = await getLandscapeVideoTrack(newRawTrack)

      for (const pc of [...peersRef.current.values(), ...publicPeersRef.current.values()]) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        await sender?.replaceTrack(newLandscapeTrack)
      }

      // Swap the device-facing track (releases the old camera hardware) and
      // the outgoing track (what preview/recorder/peers actually use) in
      // place on their respective stream objects — both were set up against
      // those exact MediaStream instances at broadcast start.
      if (currentRawTrack) {
        rawStream.removeTrack(currentRawTrack)
        currentRawTrack.stop()
      }
      rawStream.addTrack(newRawTrack)

      const currentOutputTrack = output.getVideoTracks()[0]
      if (currentOutputTrack) {
        output.removeTrack(currentOutputTrack)
        // Only stop it if it's a canvas track distinct from the raw camera
        // track above — that one's already been stopped, and stopping the
        // same track twice is harmless but this keeps intent explicit.
        if (currentOutputTrack !== currentRawTrack) currentOutputTrack.stop()
      }
      output.addTrack(newLandscapeTrack)

      // Some browsers don't repaint an already-playing <video> after its
      // srcObject's tracks change in place — reassigning forces a refresh.
      if (videoRef.current) videoRef.current.srcObject = output
    } catch {
      setError('Could not switch camera.')
    } finally {
      setSwitchingCamera(false)
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

    // Both stopped independently: outputStream's video track might be a
    // canvas track the raw camera track was never part of, and the raw
    // camera track is the only thing that actually releases the hardware
    // (the OS/browser camera-in-use indicator). Stopping a track twice
    // (e.g. the shared audio track appears in both) is a harmless no-op.
    rawStreamRef.current?.getTracks().forEach((track) => track.stop())
    rawStreamRef.current = null
    outputStreamRef.current?.getTracks().forEach((track) => track.stop())
    outputStreamRef.current = null
    stopRotationPipeline()
    if (videoRef.current) videoRef.current.srcObject = null
    setVideoDevices([])
    await sendWebRTCSignal(livestream.id, user!.id, 'broadcast-ended', {})
    setIsLive(false)
    setMinimized(false)

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
      rawStreamRef.current?.getTracks().forEach((track) => track.stop())
      rawStreamRef.current = null
      outputStreamRef.current?.getTracks().forEach((track) => track.stop())
      outputStreamRef.current = null
      stopRotationPipeline()
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
      outputStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, outputStreamRef.current!))
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

  const statusMessages = (textClass: string, mutedClass: string) => (
    <>
      {error && <p className={`text-sm ${textClass}`}>{error}</p>}
      {recordingStatus === 'uploading' && (
        <p className={`text-xs ${mutedClass}`}>Saving the recording so viewers can rewatch it later...</p>
      )}
      {recordingStatus === 'uploaded' && <p className="text-xs text-teal-500">Recording saved — viewers can rewatch this broadcast once it's over.</p>}
      {recordingStatus === 'upload-failed' && (
        <p className={`text-xs ${textClass}`}>Couldn't save the recording — the live broadcast itself was unaffected.</p>
      )}
    </>
  )

  const switchCameraButton = (size: 'lg' | 'sm') => {
    if (videoDevices.length < 2) return null
    const dims = size === 'lg' ? 'h-12 w-12 bottom-6 right-6' : 'h-8 w-8 bottom-2 right-2'
    const iconDims = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4'
    return (
      <button
        onClick={switchCamera}
        disabled={switchingCamera}
        aria-label="Switch camera"
        title="Switch camera"
        className={`absolute ${dims} flex items-center justify-center rounded-full bg-slate-950/60 text-white backdrop-blur transition hover:bg-slate-950/80 disabled:opacity-50`}
      >
        <IconCameraSwitch className={iconDims} />
      </button>
    )
  }

  return (
    <>
      {!isLive && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">{livestream.title}</h3>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[livestream.status] ?? 'bg-slate-100 text-slate-500'}`}>
              {livestream.status}
            </span>
          </div>

          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-video w-full rounded-lg border border-slate-200 bg-slate-950 object-cover"
          />

          {statusMessages('text-red-600', 'text-slate-500')}

          <button onClick={startBroadcast} disabled={recordingStatus === 'uploading'} className={`${buttonPrimary} self-start`}>
            Start broadcast
          </button>
        </div>
      )}

      {/* Full-screen broadcasting view — horizontal/landscape always, even
          on a portrait phone: the video box is aspect-video-constrained and
          centered rather than stretched to fill the viewport, so a portrait
          screen letterboxes it (black bars top/bottom) instead of distorting
          or cropping it into a vertical shape. */}
      {isLive && !minimized &&
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
            <div className="flex shrink-0 items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                <h3 className="truncate text-sm font-semibold text-white">{livestream.title}</h3>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setMinimized(true)}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
                >
                  Minimize
                </button>
                <button onClick={stopBroadcast} className={`${buttonDanger} px-3 py-1.5 text-xs`}>
                  Stop broadcast
                </button>
              </div>
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-4">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="aspect-video max-h-full max-w-full rounded-lg bg-black object-contain"
              />
              {switchCameraButton('lg')}
            </div>

            {(error || recordingStatus !== 'idle') && (
              <div className="shrink-0 px-4 pb-4">{statusMessages('text-red-400', 'text-slate-400')}</div>
            )}
          </div>,
          document.body
        )}

      {/* Minimized broadcasting view — same corner-docked footprint as
          LivestreamMiniWindow, so a broadcaster who minimizes can keep
          working elsewhere in the app while staying live. */}
      {isLive &&
        minimized &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-40 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-slate-900 px-2.5 py-1.5">
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-white">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span className="truncate">{livestream.title}</span>
              </span>
              <button
                onClick={() => setMinimized(false)}
                className="shrink-0 text-[11px] text-white/70 hover:text-white"
              >
                Expand
              </button>
            </div>

            <div className="p-2">
              <div className="relative">
                <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full rounded-lg bg-black object-cover" />
                {switchCameraButton('sm')}
              </div>
              {(error || recordingStatus !== 'idle') && <div className="mt-1.5">{statusMessages('text-red-600', 'text-slate-500')}</div>}
              <button
                onClick={stopBroadcast}
                className="mt-2 w-full rounded-lg bg-red-50 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100"
              >
                Stop broadcast
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
