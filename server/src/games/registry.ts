import type { GameModule } from './game-module.js';

class GameRegistry {
  private games = new Map<string, GameModule>();

  register(module: GameModule): void {
    this.games.set(module.definition.id, module);
  }

  get(gameId: string): GameModule | undefined {
    return this.games.get(gameId);
  }

  getAll(): GameModule[] {
    return Array.from(this.games.values());
  }
}

export const gameRegistry = new GameRegistry();
