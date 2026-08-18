// Free public STUN server for NAT traversal — no TURN relay. Works for the
// large majority of home/mobile networks; a viewer behind a strict/symmetric
// NAT or a firewall blocking direct peer traffic won't be able to connect.
// Adding a TURN server is real added infrastructure this app doesn't have.
export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
