'use client';

export default function ConnectionIndicator({
  connected,
}: {
  connected: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div
        className={`w-2 h-2 rounded-full ${
          connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
        }`}
      />
      <span className={connected ? 'text-emerald-400' : 'text-red-400'}>
        {connected ? 'Live' : 'Disconnected'}
      </span>
    </div>
  );
}
