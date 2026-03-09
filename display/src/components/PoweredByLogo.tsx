export function PoweredByLogo() {
  return (
    <div className="absolute bottom-6 right-8 flex items-center gap-2 opacity-30">
      <span className="text-gray-500 text-xs tracking-wider uppercase">Powered by</span>
      <img src="/boredless-logo.png" alt="Boredless" className="h-5 object-contain" />
    </div>
  );
}
