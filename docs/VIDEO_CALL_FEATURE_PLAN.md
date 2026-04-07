# Video Call Feature — Implementation Plan

**Status**: Planned (not yet implemented)
**Created**: 2026-03-24

---

## Overview

Add a real-time video call button to PENDING visits on the `DailyList` and `Dashboard` pages. Guards can use it to visually show a visitor to the resident via their mobile app before granting access.

**Current flow**: Guard taps "Contactar morador" → phone dialer opens (`tel:` URL)
**New flow**: Guard taps "Vídeo" → WebRTC video call between tablet (PWA) and resident phone (React Native app)

---

## Architecture Decision: Supabase Realtime Broadcast + Native WebRTC

**No new services or npm packages required on the guard PWA.**

| Layer | Technology | Notes |
|---|---|---|
| Signaling | Supabase Realtime broadcast channels | Same client already used in `Incidents.tsx` |
| Video/Audio | Browser native `RTCPeerConnection` | Zero npm packages |
| STUN | Google public STUN servers | Free, no limits |
| TURN | Cloudflare Calls TURN (free) | ~15-20% of NAT traversal cases |
| Push wake-up | FCM/APNs via Supabase Edge Function | Wakes resident app from background |
| Resident app | `react-native-webrtc` | Only new dependency (resident side) |

**Why not LiveKit / Agora / Daily.co?**
- Adds external service dependency and bandwidth costs
- LiveKit free tier (~80-100 calls/month at 480p) insufficient for growing network
- Supabase broadcast channels handle signaling perfectly (already paid for)
- WebRTC media is P2P — no Supabase bandwidth consumed

---

## Signaling Flow

```
Guard taps "Vídeo" on PENDING visit
  → Check online (video-only feature) + check unit has app installed
  → Create video_call_sessions row (status: CALLING) via RPC
  → Create push notification (type: VIDEO_CALL_REQUEST) via create_notification RPC
  → Subscribe to broadcast channel: video-call-{session_id}
  → getUserMedia({ video: true, audio: true })
  → createOffer() → setLocalDescription()
  → Broadcast { type: 'offer', sdp: ... }
  → Start 60-second timeout

Resident app receives push notification
  → Open VideoCallScreen with session_id
  → Subscribe to same broadcast channel
  → Receive SDP offer → show "Aceitar / Recusar" UI
  → [Accept] getUserMedia → setRemoteDescription → createAnswer → broadcast answer
  → ICE candidates exchanged bidirectionally
  → WebRTC P2P connection established
  → Video streams both ways

Either side ends call
  → Broadcast { type: 'hangup' }
  → Close RTCPeerConnection + unsubscribe channel
  → Update session status (ENDED / MISSED / REJECTED)
```

---

## Database Changes

### New table: `video_call_sessions`

```sql
CREATE TABLE video_call_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id        INT4 NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  guard_id        INT4 NOT NULL REFERENCES staff(id),
  resident_id     INT4 REFERENCES residents(id),
  unit_id         INT4 REFERENCES units(id),
  condominium_id  INT4 NOT NULL REFERENCES condominiums(id),
  device_id       TEXT,
  status          TEXT NOT NULL DEFAULT 'CALLING'
                  CHECK (status IN ('CALLING','ACCEPTED','REJECTED','MISSED','ENDED','FAILED')),
  initiated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at     TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  duration_seconds INT4,
  rejection_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Migration file to create: `database/add_video_call_sessions.sql`

### New RPCs (3)

| Function | Description |
|---|---|
| `create_video_call_session(p_data JSONB)` | Creates session row, returns record |
| `update_video_call_session_status(p_session_id UUID, p_status TEXT, p_rejection_reason TEXT)` | Updates status + timestamps |
| `get_active_video_call_for_resident(p_resident_id INT4)` | Resident app polls this on launch to detect missed calls |

---

## Guard PWA — Files to Create/Modify

### Create

| File | Purpose |
|---|---|
| `src/services/videoCallService.ts` | Singleton: RTCPeerConnection lifecycle, Supabase broadcast signaling, timeout management |
| `src/components/VideoCallModal.tsx` | Full-screen modal with 4 states: CALLING / CONNECTED / REJECTED / FAILED |
| `database/add_video_call_sessions.sql` | SQL migration file |

### Modify

| File | Changes |
|---|---|
| `src/types.ts` | Add `VideoCallSession`, `VideoCallStatus`, `SignalingMessage`, `SignalingMessageType` |
| `src/services/Supabase.ts` | Add 3 RPC wrappers: `createVideoCallSession`, `updateVideoCallSessionStatus`, `createVideoCallNotification` |
| `src/pages/DailyList.tsx` | Add "Vídeo" button for PENDING+online+has_unit visits, render `VideoCallModal` |
| `src/pages/Dashboard.tsx` | Same additions as DailyList |

### New environment variables (`.env.local`)

```env
VITE_TURN_USERNAME=cloudflare_turn_username
VITE_TURN_CREDENTIAL=cloudflare_turn_credential
```

---

## VideoCallModal — State Machine

```
IDLE → REQUESTING_MEDIA → CALLING → CONNECTED
                              ↓           ↓
                           REJECTED    ENDED
                              ↓
                           (auto-close 3s)
    Any state → FAILED (camera denied / network failure)
```

**CALLING screen**: Visitor photo (circular), visitor name, unit, "A chamar..." spinner, 60s countdown, "Cancelar" button

**CONNECTED screen**: Resident camera large (full modal), guard camera as PiP (bottom-right), duration timer, Mute / Camera-off / End (red) buttons

**REJECTED screen**: Reason message (declined / no answer / busy), auto-closes after 3s

**FAILED screen**: Specific error message, retry option for network errors

**Important behaviors:**
- Rendered as React Portal (avoids z-index conflict with `SyncOverlay`)
- Guard local video: `<video autoPlay playsInline muted>` (muted to prevent echo)
- Resident remote video: `<video autoPlay playsInline>`
- `window.addEventListener('beforeunload')` warns if call is active when navigating away
- Camera permission errors shown with actionable message in Portuguese

---

## Call Scenarios / Error Matrix

| Scenario | Guard app result | Session status |
|---|---|---|
| Resident accepts | CONNECTED screen, video streams | ACCEPTED |
| Resident taps "Recusar" | "Chamada recusada" → auto-close | REJECTED |
| Resident busy (active call) | "Morador ocupado" | REJECTED |
| 60s no response | "Sem resposta" | MISSED |
| Guard taps "Cancelar" | Modal closes | ENDED |
| Camera denied on guard tablet | FAILED screen: "Permita acesso à câmera" | FAILED |
| Camera denied on resident phone | Receive 'reject' signal | REJECTED |
| Network drops mid-call | 10s wait → FAILED screen | FAILED |
| Guard is offline | "Vídeo" button hidden | — |

---

## Resident App (React Native — separate codebase)

### What needs to be implemented

1. Add `react-native-webrtc` package
2. Add camera + microphone permissions (`AndroidManifest.xml` + `Info.plist`)
3. Handle push notification type `VIDEO_CALL_REQUEST`:
   - Background: launch app → navigate to `VideoCallScreen`
   - Foreground: show `IncomingCallOverlay` component
4. `VideoCallScreen`:
   - Subscribe to `video-call-{session_id}` Supabase broadcast channel
   - Receive SDP offer → show visitor info + "Aceitar / Recusar" buttons
   - Accept: `getUserMedia → setRemoteDescription(offer) → createAnswer → broadcast answer`
   - Handle ICE candidates bidirectionally via broadcast channel
   - `ontrack` event → render guard's video stream
   - Reject: broadcast `{ type: 'reject' }` → update session status

### Push notification payload sent by guard app

```json
{
  "title": "Chamada de vídeo",
  "body": "João Silva aguarda na portaria. Guarda Carlos quer mostrar o visitante.",
  "type": "VIDEO_CALL_REQUEST",
  "data": {
    "session_id": "uuid",
    "visit_id": 123,
    "visitor_name": "João Silva",
    "visitor_photo_url": "https://...",
    "guard_name": "Carlos",
    "unit_number": "204",
    "unit_block": "B"
  }
}
```

---

## Push Wake-Up (Supabase Edge Function)

**File**: `supabase/functions/send-video-call-push/index.ts`

- Called by guard app after creating the video_call_session
- Reads resident's `push_token` from `resident_devices` table
- Sends FCM (Android) with `priority: high`
- Sends APNs (iOS) with `content-available: 1` + `alert` for background launch

This is a self-contained deployment — does not affect guard PWA offline behavior.

---

## Implementation Order

1. Apply `add_video_call_sessions.sql` migration → verify table + RPCs in Supabase
2. Add types to `src/types.ts`
3. Add RPC wrappers to `src/services/Supabase.ts`
4. Create `src/services/videoCallService.ts`
5. Create `src/components/VideoCallModal.tsx`
6. Modify `src/pages/DailyList.tsx` (button + modal)
7. Modify `src/pages/Dashboard.tsx` (button + modal)
8. Deploy Supabase Edge Function for push wake-up
9. Resident app team implements `VideoCallScreen` + `react-native-webrtc`

---

## Testing Checklist

- [ ] Two browser tabs: subscribe both to same Supabase broadcast channel, verify SDP offer/answer/ICE exchange
- [ ] Camera works on HTTPS dev server (`https://localhost:3000`)
- [ ] STUN connectivity: use [test.webrtc.org](https://test.webrtc.org) on target tablet
- [ ] End-to-end: guard PWA on tablet + React Native on phone → both video streams work
- [ ] 60s timeout → session status = MISSED in Supabase
- [ ] Guard offline → "Vídeo" button hidden
- [ ] Camera denied → FAILED screen shown with correct message
- [ ] Call ended → `video_call_sessions` has correct `status`, `duration_seconds`, `answered_at`

---

## Reference Files in Guard PWA

- [DailyList.tsx](../pages/DailyList.tsx) — `handleContactResident` pattern (lines 48-71) — model for `handleVideoCall`
- [Incidents.tsx](../pages/Incidents.tsx) — Supabase Realtime subscription reference (lines 92-205)
- [Supabase.ts](../services/Supabase.ts) — where 3 new RPC wrappers are added
- [supabaseClient.ts](../services/supabaseClient.ts) — Supabase singleton used by `videoCallService`
- [types.ts](../types.ts) — add new types here first before any implementation
