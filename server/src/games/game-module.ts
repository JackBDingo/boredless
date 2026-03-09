import type { Player, PhaseState, GameDefinition, InputType } from '@boredless/shared';

/**
 * GameModule interface.
 * Every game (Bluff Battle, Village of Shadows, etc.) implements this interface.
 * The engine calls these methods; the game module NEVER calls the engine directly.
 */
export interface GameModule {
  /** Game definition (metadata for catalog) */
  readonly definition: GameDefinition;

  /** Initialize game state for a room. Called when host starts game. */
  setup(roomId: string, players: Player[]): void;

  /** Get the current phase state */
  getPhaseState(roomId: string): PhaseState;

  /** Get public state visible on the shared display */
  getPublicState(roomId: string): Record<string, unknown>;

  /** Get private state for a specific player */
  getPrivateState(roomId: string, playerId: string): Record<string, unknown>;

  /**
   * Handle player input. Returns true if input was accepted.
   * The game module is responsible for advancing phases when appropriate.
   */
  handleInput(
    roomId: string,
    playerId: string,
    inputType: InputType,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string };

  /** Clean up game state for a room */
  teardown(roomId: string): void;
}
