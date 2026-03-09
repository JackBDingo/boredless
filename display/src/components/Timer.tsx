import { useRoomStore } from '../store/room';

export function Timer() {
  const remainingMs = useRoomStore((s) => s.timerRemainingMs);

  if (remainingMs === null) return null;

  const seconds = Math.ceil(remainingMs / 1000);
  const isUrgent = seconds <= 5;

  return (
    <div
      className={`text-6xl font-bold tabular-nums ${
        isUrgent ? 'text-red-500 animate-pulse' : 'text-white'
      }`}
    >
      {seconds}
    </div>
  );
}
