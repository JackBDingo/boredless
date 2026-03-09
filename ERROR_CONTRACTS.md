# ERROR_CONTRACTS.md — Error Handling Specifications

## PURPOSE

This document specifies EXACTLY how every error condition is handled
across the entire system. No ambiguity, no agent interpretation.

---

## 1. WEBSOCKET ERROR CODES

| Code | Name             | When Sent                          | Client Action                     |
|------|------------------|------------------------------------|-----------------------------------|
| 1000 | NORMAL           | Clean disconnect                   | Show "Disconnected" message       |
| 1001 | GOING_AWAY       | Server shutting down               | Attempt reconnect after 2s        |
| 4000 | ROOM_CLOSED      | Room was closed by host            | Return to join/home screen        |
| 4001 | KICKED           | Player was kicked by host          | Show "You were kicked" + return   |
| 4002 | INVALID_SESSION  | Reconnect with bad token/session   | Clear stored session, rejoin      |
| 4003 | ROOM_FULL        | Room at max capacity               | Show "Room is full" error         |

---

## 2. SERVER ERROR MESSAGES

The server sends `ServerMessageType.ERROR` with these exact `code` strings.
Clients MUST handle each one specifically.

| Error Code         | Message (exact string)                              | Server Context                           |
|--------------------|------------------------------------------------------|------------------------------------------|
| PARSE_ERROR        | "Invalid message format"                             | WebSocket message is not valid JSON      |
| UNKNOWN_MESSAGE    | "Unknown message type"                               | Unrecognized `type` field                |
| JOIN_FAILED        | (varies — room-specific reason)                      | joinRoom returned error                  |
| REJOIN_FAILED      | (varies — session/token reason)                      | rejoin returned error                    |
| DISPLAY_FAILED     | "Room not found"                                     | registerDisplay got invalid roomId       |
| NOT_HOST           | "Only the host can [action]"                         | Non-host tried host-only action          |
| INVALID_GAME       | "Game not found" / "Game module not found"           | Unknown gameId                           |
| NO_GAME            | "No game selected"                                   | Start game without selection             |
| TOO_FEW_PLAYERS    | "Need at least N players"                            | Below game minimum                       |
| TOO_MANY_PLAYERS   | "Maximum N players"                                  | Above game maximum                       |

### joinRoom Error Reasons (exact strings):
- "Room not found"
- "Room is closed"
- "Game already in progress"
- "Room is full"

### rejoin Error Reasons (exact strings):
- "Session not found"
- "Invalid token"
- "Room no longer exists"
- "Reconnect grace period expired"

### Game Input Rejection Reasons:
- "Game not found"
- "Not in submission phase"
- "Already submitted"
- "Empty answer"
- "Not in voting phase"
- "Already voted"
- "Invalid answer"
- "Cannot vote for own answer"
- "Invalid input type for current phase"
- "Not night phase"
- "Already acted this night"
- "No role found"
- "Villagers have no night action"
- "Target is not alive"
- "Cannot target another werewolf"
- "Not in vote phase"
- "Cannot vote for yourself"
- "Dead players cannot act"
- "Invalid input type"

---

## 3. CLIENT ERROR HANDLING

### Display Client (TV)

The display should NEVER show error modals or popups.
It is a shared screen — errors should be handled gracefully:

| Scenario                      | Display Behavior                                      |
|-------------------------------|-------------------------------------------------------|
| WebSocket disconnects         | Show reconnecting spinner overlay                     |
| WebSocket reconnects          | Remove spinner, sync full state                       |
| Room closed                   | Return to home screen                                 |
| Server unreachable            | Show "Connecting to server..." on home screen         |
| Invalid room on create        | Show "Failed to create room" below button, re-enable  |
| Unknown game state            | Show "Loading..." (never crash)                       |

### Phone Client (Controller)

The phone can show error messages since it's personal:

| Scenario                      | Phone Behavior                                        |
|-------------------------------|-------------------------------------------------------|
| Invalid room code             | Shake input, show "Room not found" below field        |
| Room full                     | Show "Room is full" alert                             |
| Game in progress              | Show "Game already started" alert                     |
| Kicked by host                | Show "You were kicked" → return to join screen        |
| Disconnected                  | Show "Reconnecting..." banner at top                  |
| Reconnect failed              | Show "Connection lost" → return to join screen        |
| Input rejected                | Brief toast/flash message with reason                 |
| Submit while waiting          | Disable submit button, show "Submitted ✓"            |
| Vote while waiting            | Disable all vote buttons, show "Vote cast ✓"         |
| Dead in Village               | Show dead state, disable all action buttons           |

---

## 4. PHASE TRANSITION ERROR PREVENTION

### Problem: Timer fires after game teardown
**Solution:** Every timer callback MUST check if game state still exists:
```ts
timerEngine.start(roomId, phase, durationMs, sessionIds, () => {
  const state = this.states.get(roomId);
  if (!state) return; // Game was torn down, do nothing
  this.nextPhase(roomId);
});
```

### Problem: Player submits input during wrong phase
**Solution:** Every `handleInput` method checks `state.currentPhase` FIRST:
```ts
if (state.currentPhase !== PhaseType.BB_SUBMIT) {
  return { accepted: false, reason: 'Not in submission phase' };
}
```

### Problem: Race condition — all players submit, timer also fires
**Solution:** When all players submit, immediately stop the timer:
```ts
if (state.submissions.size >= state.players.length) {
  timerEngine.stop(roomId); // Cancel timer BEFORE advancing
  this.startVoting(roomId);
}
```
The timer's `onExpire` callback also calls `this.startVoting()`, but the
timer won't fire because it was stopped. If somehow both fire, `startVoting`
must be idempotent — check current phase before transitioning:
```ts
private startVoting(roomId: string): void {
  const state = this.states.get(roomId);
  if (!state || state.currentPhase !== PhaseType.BB_SUBMIT) return; // Already transitioned
  // ... proceed
}
```

### Problem: Player disconnects during game
**Solution:** Game continues with remaining players. Disconnected player:
- Cannot submit inputs (their WebSocket is gone)
- Still appears in player list (grayed out)
- Timer phases auto-advance even without their input
- In Bluff Battle: they just don't submit/vote (game skips them)
- In Village: their night action counts as "no action"
  - Werewolf who disconnects: werewolves have one less vote
  - Seer who disconnects: no inspection happens
  - Doctor who disconnects: no protection happens

---

## 5. RECONNECTION PROTOCOL

### Sequence:
```
1. Client detects disconnect (WebSocket onclose)
2. Client waits 1 second
3. Client opens new WebSocket to /ws
4. Client sends REJOIN message with stored sessionId + reconnectToken
5. Server validates session and token
6. Server checks grace period (30 seconds from disconnect)
7. If valid:
   a. Server re-registers session to new WebSocket
   b. Server sends JOINED message with full room state
   c. If game active: Server sends PHASE_CHANGED + PRIVATE_STATE
   d. Server notifies other players (PLAYER_JOINED)
8. If invalid:
   a. Server sends ERROR with code REJOIN_FAILED
   b. Client clears stored session
   c. Client returns to join screen
```

### Client Reconnect Logic:
```ts
// EXACT implementation for both display and phone
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff

let reconnectAttempt = 0;

function onDisconnect() {
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    // Give up — return to join/home screen
    resetToJoinScreen();
    return;
  }

  const delay = RECONNECT_DELAYS[reconnectAttempt] ?? 16000;
  reconnectAttempt++;

  setTimeout(() => {
    try {
      reconnect(); // Uses stored sessionId + reconnectToken
    } catch {
      onDisconnect(); // Try again
    }
  }, delay);
}

function onReconnectSuccess() {
  reconnectAttempt = 0; // Reset counter on success
}
```

NOTE: This reconnect logic is NOT in BUILD_SPEC.md. It is an enhancement
that agents SHOULD implement in the connection stores. If time is limited,
a simple "retry once after 2 seconds" is acceptable for MVP.

---

## 6. INPUT VALIDATION BOUNDARIES

### Where validation happens:

| Layer              | What It Validates                                  |
|--------------------|----------------------------------------------------|
| Phone client       | Non-empty fields, character limits (UX feedback)   |
| WebSocket handler  | Message structure, session exists, room exists      |
| Game module        | Phase correctness, player eligibility, game rules   |

### Validation is REDUNDANT by design:
The client validates for UX (immediate feedback).
The server validates for security (never trust the client).
Both layers reject the same invalid inputs.
If they disagree, the server is authoritative.

### What the server NEVER trusts from the client:
- Player identity (derived from session, not message)
- Room identity (derived from session, not message)
- Game phase (checked against server state)
- Host status (checked against room.hostPlayerId)
- Player alive status (checked against game state)

---

*This document eliminates ambiguity in error handling.*
*Every error has one correct response. Follow it.*
