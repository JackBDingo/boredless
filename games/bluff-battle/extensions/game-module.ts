/**
 * game-module.ts — Bluffalo V2 game module factory.
 *
 * Creates a DeclarativeGameModule with a registered ExtensionActionHandler
 * that dispatches Bluffalo's four custom actions:
 *
 *   bluffalo_draw_prompt   — draw a random unused prompt
 *   bluffalo_build_answers — combine fakes + correct answer, shuffle
 *   bluffalo_score_round   — award points based on who fooled whom
 *   bluffalo_build_reveal  — build reveal data for display
 *
 * Uses the proper ExtensionActionHandler API (Phase 5.1) instead of
 * wrapping/proxying the GameContext.
 */

import type { GameDefinition } from '@boredless/shared';
import type { GamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import { DeclarativeGameModule } from '../../../server/src/runtime/interpreter/index.js';
import type { ExtensionActionContext, ExtensionActionHandler } from '../../../server/src/runtime/interpreter/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';

import {
  isBluffaloAction,
  handleDrawPrompt,
  handleBuildAnswers,
  handleScoreRound,
  handleBuildReveal,
  type BluffaloActionContext,
} from './index.js';

// ---------------------------------------------------------------------------
// Adapter: ExtensionActionContext → BluffaloActionContext
// ---------------------------------------------------------------------------

function toBluffaloContext(ctx: ExtensionActionContext): BluffaloActionContext {
  return {
    globals: ctx.globals,
    players: ctx.players,
    playerInfo: ctx.playerInfo,
    getScore: ctx.getScore,
    setGlobal: ctx.setGlobal,
    addPoints: ctx.addPoints,
    log: (msg: string, data?: unknown) => {
      ctx.log(msg, data as Record<string, unknown>);
    },
  };
}

// ---------------------------------------------------------------------------
// Extension action handler factory
// ---------------------------------------------------------------------------

/**
 * Create a Bluffalo ExtensionActionHandler.
 *
 * @param gameDir - Path to the game directory (for prompt loading)
 */
function createBluffaloHandler(gameDir: string): ExtensionActionHandler {
  return (actionName: string, ctx: ExtensionActionContext): boolean => {
    if (!isBluffaloAction(actionName)) return false;

    const bCtx = toBluffaloContext(ctx);

    switch (actionName) {
      case 'bluffalo_draw_prompt':
        handleDrawPrompt(bCtx, gameDir);
        return true;
      case 'bluffalo_build_answers':
        handleBuildAnswers(bCtx);
        return true;
      case 'bluffalo_score_round':
        handleScoreRound(bCtx);
        return true;
      case 'bluffalo_build_reveal':
        handleBuildReveal(bCtx);
        return true;
      default:
        return false;
    }
  };
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a Bluffalo DeclarativeGameModule with extension action support.
 * Used by auto-discover.ts as the createModule factory for bluff-battle.
 */
export function createBluffaloModule(
  definition: GameDefinition,
  gamePackage: GamePackage,
  gameDir: string,
  timerImpl?: TimerImpl,
): DeclarativeGameModule {
  const handler = createBluffaloHandler(gameDir);
  return new DeclarativeGameModule(definition, gamePackage, timerImpl, handler);
}
