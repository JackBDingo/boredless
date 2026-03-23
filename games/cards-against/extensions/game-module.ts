/**
 * game-module.ts — Cards Against Humanity V2 game module factory.
 *
 * Creates a DeclarativeGameModule with a registered ExtensionActionHandler
 * that dispatches CAH's five custom actions:
 *
 *   cah_deal_cards         — Initialize deck, deal starting hands
 *   cah_select_black_card  — Draw black card for current round
 *   cah_build_submissions  — Anonymize + shuffle player submissions
 *   cah_czar_pick_winner   — Process Card Czar's winner selection
 *   cah_rotate_czar        — Advance Card Czar, replenish hands
 *
 * State Architecture:
 *   ExtensionActionContext only provides setGlobal() for mutations.
 *   CAH stores per-player data (hands, selections) as JSON maps in globals:
 *     globals.hands_map_json      — player hands
 *     globals.selections_map_json — player card selections
 *     globals.submitted_map_json  — submission status
 *   All declared private in game.yaml → redacted from public state.
 *
 * Input Handling:
 *   The prompt phase uses 'vote' primitive as a proxy. The extension handler
 *   intercepts vote inputs during the prompt phase to validate card submissions
 *   (correct count, cards in hand, not czar). The czar's submission during
 *   reading (picking a winner) is handled by the standard vote primitive.
 */

import type { GameDefinition } from '@boredless/shared';
import type { GamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import { DeclarativeGameModule } from '../../../server/src/runtime/interpreter/index.js';
import type { ExtensionActionContext, ExtensionActionHandler } from '../../../server/src/runtime/interpreter/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';

import {
  isCAHAction,
  handleDealCards,
  handleSelectBlackCard,
  handleBuildSubmissions,
  handleCzarPickWinner,
  handleRotateCzar,
  type CAHActionContext,
} from './index.js';

// ---------------------------------------------------------------------------
// Adapter: ExtensionActionContext → CAHActionContext
// ---------------------------------------------------------------------------

function toCAHContext(ctx: ExtensionActionContext): CAHActionContext {
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

function createCAHHandler(gameDir: string): ExtensionActionHandler {
  return (actionName: string, ctx: ExtensionActionContext): boolean => {
    if (!isCAHAction(actionName)) return false;

    const cahCtx = toCAHContext(ctx);

    switch (actionName) {
      case 'cah_deal_cards':
        handleDealCards(cahCtx, gameDir);
        return true;
      case 'cah_select_black_card':
        handleSelectBlackCard(cahCtx);
        return true;
      case 'cah_build_submissions':
        handleBuildSubmissions(cahCtx);
        return true;
      case 'cah_czar_pick_winner':
        handleCzarPickWinner(cahCtx);
        return true;
      case 'cah_rotate_czar':
        handleRotateCzar(cahCtx);
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
 * Create a CAH DeclarativeGameModule with extension action support.
 * Used by auto-discover.ts as the createModule factory for cards-against.
 */
export function createCAHModule(
  definition: GameDefinition,
  gamePackage: GamePackage,
  gameDir: string,
  timerImpl?: TimerImpl,
): DeclarativeGameModule {
  const handler = createCAHHandler(gameDir);
  return new DeclarativeGameModule(definition, gamePackage, timerImpl, handler);
}
