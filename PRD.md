# Boredless PRD

Working product name: Boredless
Optional consumer-facing brand later: Couch Party
Version: MVP v1

## Product Summary

Boredless is a social gaming platform where:
- A TV or large shared screen displays the public game state
- Phones act as controllers and private player interfaces
- A backend server runs authoritative game logic, room state, timing, scoring, and synchronization

The MVP is a first-party game platform with a reusable engine capable of supporting multiple social games.

## MVP Games

1. **Bluff Battle** — text input + voting (like Fibbage)
2. **Village of Shadows** — hidden roles + day/night + voting (like Werewolf)
3. ~~Sketch Attack~~ — DEFERRED (drawing canvas complexity)

## Key Constraints

- No accounts required for players
- Join via QR code in under 60 seconds
- Server-authoritative game logic
- Public/private state split (TV sees public, phones see private)
- Support both in-person and remote play
- Up to 12 players per room
- No Next.js — deploy-anywhere architecture

## Full PRD

See the original email PRD for complete user stories, acceptance criteria, and game specifications.
The BUILD_SPEC.md is the authoritative technical document for implementation.
