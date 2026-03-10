import { JoinScreen } from './screens/JoinScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { usePlatform } from './platform/BoredlessClient';

/**
 * App — trivial screen router.
 * ALL lifecycle logic lives in the platform SDK.
 * This component just renders whatever screen the platform says to show.
 */
export default function App() {
  const screen = usePlatform((s) => s.screen);

  return (
    <div className="w-full min-h-dvh bg-gray-950">
      {screen === 'join' && <JoinScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'game' && <GameScreen />}
      {screen === 'gameOver' && <GameScreen />}
    </div>
  );
}
