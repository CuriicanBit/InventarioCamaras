import React, { useState } from 'react';

interface NodoUALogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  version?: string;
}

export const NodoUALogo: React.FC<NodoUALogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
  version = 'v2.4'
}) => {
  const [imgError, setImgError] = useState(false);

  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-8 h-8 sm:w-9 sm:h-9',
    lg: 'w-10 h-10 sm:w-11 sm:h-11'
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-sm sm:text-base',
    lg: 'text-base sm:text-lg'
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Logo Graphic: tries uploaded image first, falls back gracefully to high-res SVG */}
      <div className={`relative ${iconSizes[size]} shrink-0 flex items-center justify-center rounded-lg overflow-hidden shadow-xs border border-slate-700/20 bg-gradient-to-br from-[#0b192c] via-[#1e3e62] to-[#002244]`}>
        {!imgError ? (
          <img 
            src="/logo.png" 
            alt="NodoUA" 
            className="w-full h-full object-contain p-0.5"
            onError={() => setImgError(true)}
          />
        ) : null}

        {imgError && (
          <svg
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full p-1"
          >
            {/* Background subtle mesh grid */}
            <defs>
              <linearGradient id="uaGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop stopColor="#2563EB" />
                <stop offset="0.6" stopColor="#1D4ED8" />
                <stop offset="1" stopColor="#DC2626" />
              </linearGradient>
              <linearGradient id="nodeGlow" x1="8" y1="8" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#60A5FA" />
                <stop offset="1" stopColor="#3B82F6" />
              </linearGradient>
            </defs>

            {/* Network Node Connections */}
            <path
              d="M10 28L10 12L20 22L30 12L30 28"
              stroke="url(#nodeGlow)"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow"
            />
            <path
              d="M10 12L30 28"
              stroke="#93C5FD"
              strokeWidth="1.2"
              strokeDasharray="2 2"
              opacity="0.6"
            />
            <path
              d="M30 12L10 28"
              stroke="#FCA5A5"
              strokeWidth="1.2"
              strokeDasharray="2 2"
              opacity="0.6"
            />

            {/* Network Nodes (Vertices) */}
            <circle cx="10" cy="12" r="3.2" fill="#60A5FA" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx="30" cy="12" r="3.2" fill="#60A5FA" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx="20" cy="22" r="3.6" fill="#F87171" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx="10" cy="28" r="3.2" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx="30" cy="28" r="3.2" fill="#EF4444" stroke="#FFFFFF" strokeWidth="1.5" />

            {/* Small center pulse */}
            <circle cx="20" cy="22" r="1.5" fill="#FFFFFF" />
          </svg>
        )}
      </div>

      {/* Typography */}
      {showText && (
        <div className="flex flex-col">
          <div className={`font-bold text-slate-900 tracking-tight ${textSizes[size]} flex items-center gap-1.5 leading-none`}>
            <span className="flex items-center tracking-tight">
              <span className="text-slate-900 font-extrabold">Nodo</span>
              <span className="text-blue-600 font-black">UA</span>
            </span>
            {version && (
              <span className="hidden xs:inline-block text-[9px] sm:text-[10px] font-mono font-medium text-blue-700 bg-blue-50 px-1 py-0.2 rounded border border-blue-200">
                {version}
              </span>
            )}
          </div>
          <div className="hidden sm:block text-[9px] sm:text-[10px] font-medium tracking-tight text-slate-500 uppercase mt-0.5">
            Planta Física · Telecomunicaciones
          </div>
        </div>
      )}
    </div>
  );
};
