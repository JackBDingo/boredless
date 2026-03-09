import { useConnectionStore } from '@phone/store/connection';
import { useGameStore } from '@phone/store/game';
import type { PhaseState, GameEventHook } from '@boredless/shared';
import type { VillagePrivateState } from '../types.js';
import { PhaseType, ClientMessageType, InputType } from '@boredless/shared';
import { VillageRole } from '../types.js';
import { getRoleInfo } from './roleInfo';
import {
  Users, Crosshair, Eye, Shield, Moon, Sun,
  Vote, Monitor, Trophy, Skull,
  Check, Star
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PoweredByLogo } from '@phone/components/PoweredByLogo';

const ROLE_ICONS: Record<string, LucideIcon> = {
  Users, Crosshair, Eye, Shield,
};

interface Props {
  phase: PhaseState;
  privateState: Record<string, unknown>;
  /** Custom event listener — use to react to server events emitted via ctx.emitTo() */
  useGameEvent: GameEventHook;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function VillagePhone({ phase, privateState, useGameEvent: _useGameEvent }: Props) {
  const state = privateState as unknown as VillagePrivateState;
  const send = useConnectionStore((s) => s.send);
  const timerMs = useGameStore((s) => s.timerRemainingMs);

  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const isUrgent = seconds !== null && seconds <= 5;
  const roleInfo = getRoleInfo(state.role);
  const RoleIcon = ROLE_ICONS[roleInfo.lucideIcon] ?? Users;

  const handleNightAction = (targetPlayerId: string) => {
    send({
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.NIGHT_ACTION,
      payload: { targetPlayerId },
    });
  };

  const handleVote = (targetPlayerId: string) => {
    send({
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.VOTE,
      payload: { answerId: targetPlayerId },
    });
  };

  // Role badge component
  const RoleBadge = () => (
    <div
      className="flex items-center gap-2 px-4 py-2 rounded-full border"
      style={{
        backgroundColor: roleInfo.color + '22',
        borderColor: roleInfo.color + '4d',
      }}
    >
      <RoleIcon size={20} style={{ color: roleInfo.color }} />
      <span className="font-bold" style={{ color: roleInfo.color }}>
        {roleInfo.name}
      </span>
    </div>
  );

  // Dead player spectator view
  if (!state.isAlive) {
    return (
      <div className="flex flex-col min-h-dvh bg-gray-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
        <div className="flex flex-col items-center justify-center flex-1 px-6 text-center relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gray-500/15 flex items-center justify-center mb-6">
            <Skull size={32} className="text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Eliminated</h2>
          <p className="text-gray-500 mb-4">You were the {roleInfo.name}</p>
          <RoleBadge />
          <p className="text-gray-600 text-sm mt-6">Watch the game on the TV</p>
        </div>
        <div className="fixed bottom-0 inset-x-0">
          <PoweredByLogo />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-dvh bg-gray-950 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-indigo-500/8 rounded-full blur-3xl" />

      <div className="relative z-10 w-full flex flex-col items-center px-6 py-8 overflow-y-auto min-h-dvh">
        {/* Timer */}
        {seconds !== null && (
          <div className={`text-5xl font-bold tabular-nums mb-6 ${
            isUrgent ? 'text-red-400' : 'text-white/30'
          }`}>
            {seconds}
          </div>
        )}

        {/* Role badge */}
        <div className="mb-6">
          <RoleBadge />
        </div>

        {/* ROLE REVEAL */}
        {phase.phaseType === PhaseType.VOS_ROLE_REVEAL && (
          <div className="flex flex-col items-center gap-4 text-center w-full">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/15 flex items-center justify-center">
              <Star size={32} className="text-violet-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Your Role</h2>
            <p className="text-gray-400 text-sm leading-relaxed px-4">{roleInfo.description}</p>
            {state.werewolfTeammates.length > 0 && (
              <div className="mt-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-red-400 text-sm">Your pack is in the room...</p>
              </div>
            )}
          </div>
        )}

        {/* NIGHT — werewolf/seer/doctor act */}
        {phase.phaseType === PhaseType.VOS_NIGHT &&
          state.role !== VillageRole.VILLAGER &&
          !state.hasActed &&
          state.nightTargets && (
            <div className="w-full flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 flex items-center justify-center">
                {state.role === VillageRole.WEREWOLF && <Crosshair size={32} className="text-red-400" />}
                {state.role === VillageRole.SEER && <Eye size={32} className="text-violet-400" />}
                {state.role === VillageRole.DOCTOR && <Shield size={32} className="text-blue-400" />}
              </div>
              <h2 className="text-xl font-bold text-white text-center">
                {state.role === VillageRole.WEREWOLF && 'Choose a victim'}
                {state.role === VillageRole.SEER && 'Choose who to inspect'}
                {state.role === VillageRole.DOCTOR && 'Choose who to protect'}
              </h2>
              <div className="w-full flex flex-col gap-2 mt-2">
                {state.nightTargets.map((target) => (
                  <button
                    key={target.playerId}
                    onClick={() => handleNightAction(target.playerId)}
                    className="w-full bg-white/[0.03] hover:bg-white/[0.06] active:bg-white/[0.08]
                      text-white text-lg text-center
                      rounded-2xl px-5 py-4
                      border border-white/10 hover:border-indigo-500/40
                      min-h-[44px] transition-all duration-200"
                  >
                    {target.playerName}
                  </button>
                ))}
              </div>
            </div>
          )}

        {/* NIGHT — already acted */}
        {phase.phaseType === PhaseType.VOS_NIGHT &&
          state.role !== VillageRole.VILLAGER &&
          state.hasActed && (
            <div className="flex flex-col items-center gap-4 text-center mt-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
                <Check size={32} className="text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">Action Submitted</h2>
              <p className="text-gray-500">Waiting for night to end...</p>
            </div>
          )}

        {/* NIGHT — villager sleeps */}
        {phase.phaseType === PhaseType.VOS_NIGHT && state.role === VillageRole.VILLAGER && (
          <div className="flex flex-col items-center gap-4 text-center mt-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/15 flex items-center justify-center">
              <Moon size={32} className="text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Night</h2>
            <p className="text-gray-500">The village sleeps... close your eyes</p>
          </div>
        )}

        {/* NIGHT RESULT — seer */}
        {phase.phaseType === PhaseType.VOS_NIGHT_RESULT && state.seerResult && (
          <div className="flex flex-col items-center gap-4 text-center mt-4">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/15 flex items-center justify-center">
              <Eye size={32} className="text-violet-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Vision</h2>
            <p className="text-lg text-gray-300">
              <span className="font-bold text-white">{state.seerResult.targetPlayerName}</span> is{' '}
              {state.seerResult.isWerewolf ? (
                <span className="text-red-400 font-bold">a Werewolf</span>
              ) : (
                <span className="text-emerald-400 font-bold">not a Werewolf</span>
              )}
            </p>
          </div>
        )}

        {/* NIGHT RESULT — non-seer */}
        {phase.phaseType === PhaseType.VOS_NIGHT_RESULT && !state.seerResult && (
          <div className="flex flex-col items-center gap-4 text-center mt-4">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/15 flex items-center justify-center">
              <Monitor size={32} className="text-purple-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Look at the TV</h2>
            <p className="text-gray-500">Results are being revealed</p>
          </div>
        )}

        {/* DAY — discussion */}
        {phase.phaseType === PhaseType.VOS_DAY && (
          <div className="flex flex-col items-center gap-4 text-center mt-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 flex items-center justify-center">
              <Sun size={32} className="text-amber-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Discussion</h2>
            <p className="text-gray-500">Talk to the other players. Who seems suspicious?</p>
          </div>
        )}

        {/* VOTE — choose */}
        {phase.phaseType === PhaseType.VOS_VOTE && !state.hasVoted && state.voteTargets && (
          <div className="w-full flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center">
              <Vote size={32} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white text-center">Vote to Eliminate</h2>
            <div className="w-full flex flex-col gap-2 mt-2">
              {state.voteTargets.map((target) => (
                <button
                  key={target.playerId}
                  onClick={() => handleVote(target.playerId)}
                  className="w-full bg-white/[0.03] hover:bg-red-900/20 active:bg-red-900/30
                    text-white text-lg text-center
                    rounded-2xl px-5 py-4
                    border border-white/10 hover:border-red-500/40
                    min-h-[44px] transition-all duration-200"
                >
                  {target.playerName}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* VOTE — voted */}
        {phase.phaseType === PhaseType.VOS_VOTE && state.hasVoted && (
          <div className="flex flex-col items-center gap-4 text-center mt-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 flex items-center justify-center">
              <Vote size={32} className="text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Vote Cast</h2>
            <p className="text-gray-500">Waiting for results...</p>
          </div>
        )}

        {/* VOTE RESULT */}
        {phase.phaseType === PhaseType.VOS_VOTE_RESULT && (
          <div className="flex flex-col items-center gap-4 text-center mt-4">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/15 flex items-center justify-center">
              <Monitor size={32} className="text-purple-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Look at the TV</h2>
            <p className="text-gray-500">The village has spoken</p>
          </div>
        )}

        {/* GAME OVER */}
        {phase.phaseType === PhaseType.GAME_OVER && (
          <div className="flex flex-col items-center gap-4 text-center mt-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 flex items-center justify-center">
              <Trophy size={32} className="text-amber-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Game Over</h2>
            <p className="text-gray-500">Check the TV for final results</p>
          </div>
        )}
      </div>
      <div className="fixed bottom-0 inset-x-0">
        <PoweredByLogo />
      </div>
    </div>
  );
}

export default VillagePhone;
