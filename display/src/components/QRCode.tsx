interface QRCodeProps {
  dataUrl: string;
  roomCode: string;
}

export function QRCode({ dataUrl, roomCode }: QRCodeProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <img src={dataUrl} alt="QR Code" className="w-64 h-64 rounded-xl" />
      <div className="text-center">
        <p className="text-gray-400 text-sm">or enter code</p>
        <p className="text-5xl font-bold tracking-widest text-white">{roomCode}</p>
      </div>
    </div>
  );
}
