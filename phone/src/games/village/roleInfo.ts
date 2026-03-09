import { VillageRole } from '@boredless/shared';

interface RoleDisplayInfo {
  name: string;
  description: string;
  emoji: string;
  color: string;
}

export function getRoleInfo(role: VillageRole): RoleDisplayInfo {
  switch (role) {
    case VillageRole.VILLAGER:
      return {
        name: 'Villager',
        description: 'Find and eliminate the werewolves through discussion and voting. Trust your instincts!',
        emoji: '🏘️',
        color: '#10b981',
      };
    case VillageRole.WEREWOLF:
      return {
        name: 'Werewolf',
        description: 'Each night, choose a villager to eliminate. During the day, blend in and avoid suspicion.',
        emoji: '🐺',
        color: '#ef4444',
      };
    case VillageRole.SEER:
      return {
        name: 'Seer',
        description: 'Each night, inspect one player to learn if they are a werewolf. Use your knowledge wisely.',
        emoji: '🔮',
        color: '#8b5cf6',
      };
    case VillageRole.DOCTOR:
      return {
        name: 'Doctor',
        description: 'Each night, choose one player to protect. If the werewolves target them, they survive.',
        emoji: '💉',
        color: '#3b82f6',
      };
  }
}
