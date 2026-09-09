import React from 'react';

interface CakraNexaLogoProps {
  className?: string;
  size?: number | string;
  variant?: 'mark-only' | 'full' | 'badge';
}

export const CakraNexaLogo: React.FC<CakraNexaLogoProps> = ({
  className = 'w-9 h-9',
  variant = 'mark-only',
}) => {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-sm"
      >
        <defs>
          {/* Rich Metallic Gold Gradient */}
          <linearGradient id="goldFeatherGrad" x1="50" y1="10" x2="160" y2="150" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F9E7B0" />
            <stop offset="35%" stopColor="#DFBF64" />
            <stop offset="70%" stopColor="#C5A059" />
            <stop offset="100%" stopColor="#8C6D28" />
          </linearGradient>

          {/* Golden Page Arc Gradient */}
          <linearGradient id="goldPageGrad" x1="20" y1="120" x2="180" y2="150" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#8C6D28" />
            <stop offset="25%" stopColor="#DFBF64" />
            <stop offset="50%" stopColor="#F9E7B0" />
            <stop offset="75%" stopColor="#DFBF64" />
            <stop offset="100%" stopColor="#8C6D28" />
          </linearGradient>

          {/* Deep Navy Spine Gradient */}
          <linearGradient id="navySpineGrad" x1="30" y1="130" x2="170" y2="155" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0B1528" />
            <stop offset="50%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#0B1528" />
          </linearGradient>
        </defs>

        {/* ================= OPEN BOOK FOUNDATION ================= */}
        {/* Navy Bottom Left Page Wing */}
        <path
          d="M100 148 C75 138 45 138 24 144 C42 133 72 133 100 142 Z"
          fill="url(#navySpineGrad)"
        />

        {/* Navy Bottom Right Page Wing */}
        <path
          d="M100 148 C125 138 155 138 176 144 C158 133 128 133 100 142 Z"
          fill="url(#navySpineGrad)"
        />

        {/* Golden Upper Left Curved Page */}
        <path
          d="M100 141 C76 128 48 128 26 138 C48 123 78 122 100 134 Z"
          fill="url(#goldPageGrad)"
        />

        {/* Golden Upper Right Curved Page */}
        <path
          d="M100 141 C124 128 152 128 174 138 C152 123 122 122 100 134 Z"
          fill="url(#goldPageGrad)"
        />

        {/* Center Spine Crease Accent */}
        <path
          d="M100 134 L100 150"
          stroke="#DFBF64"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* ================= PEN NIB ================= */}
        {/* Pen Nib Body */}
        <path
          d="M100 136 L92 114 C94 113 97 112 100 112 C103 112 106 113 108 114 Z"
          fill="url(#goldFeatherGrad)"
          stroke="#8C6D28"
          strokeWidth="0.5"
        />

        {/* Nib Breather Hole */}
        <circle cx="100" cy="120.5" r="1.8" fill="#0F172A" />

        {/* Nib Ink Slit Line */}
        <path
          d="M100 122.5 L100 136"
          stroke="#0F172A"
          strokeWidth="1"
          strokeLinecap="round"
        />

        {/* ================= GOLDEN QUILL FEATHER ================= */}
        {/* Main Feather Vane Body (Curving elegantly upward to the right) */}
        <path
          d="M96 113 
             C90 102 88 92 90 82 
             C90 82 86 86 85 91
             C84 81 87 71 94 62 
             C93 62 90 66 89 71
             C90 60 97 49 107 38 
             C106 38 103 42 103 47
             C106 36 118 24 136 18 
             C142 16 148 18 147 21
             C136 26 130 33 127 40 
             C131 38 136 37 138 38
             C130 46 124 54 122 62 
             C127 60 133 60 134 62
             C126 71 119 82 118 92 
             C121 91 125 91 126 93
             C118 102 110 110 104 113 
             Z"
          fill="url(#goldFeatherGrad)"
        />

        {/* Central Feather Rachis / Shaft (Spine Highlight) */}
        <path
          d="M100 114 C98 88 107 55 138 21"
          stroke="#F9E7B0"
          strokeWidth="1.75"
          strokeLinecap="round"
        />

        {/* Feather Texture Barbs (Subtle delicate incision lines) */}
        <path
          d="M99 98 C94 94 92 92 91 91 M100 84 C95 80 92 77 90 73 M102 70 C98 66 94 61 93 57"
          stroke="#8C6D28"
          strokeWidth="0.75"
          opacity="0.4"
          strokeLinecap="round"
        />
        <path
          d="M104 100 C110 96 115 95 119 94 M107 86 C114 82 120 81 124 81 M111 72 C118 67 124 65 129 65"
          stroke="#F9E7B0"
          strokeWidth="0.75"
          opacity="0.5"
          strokeLinecap="round"
        />

        {/* Optional Subtext for 'full' variant */}
        {variant === 'full' && (
          <g>
            <text
              x="100"
              y="173"
              textAnchor="middle"
              fill="#0F172A"
              fontSize="11"
              fontWeight="bold"
              letterSpacing="2"
              fontFamily="serif"
            >
              PT CAKRAWALA
            </text>
            <path d="M40 180 L88 180 M112 180 L160 180" stroke="#DFBF64" strokeWidth="0.8" />
            <polygon points="100,178 102,180 100,182 98,180" fill="#DFBF64" />
            <text
              x="100"
              y="192"
              textAnchor="middle"
              fill="#0F172A"
              fontSize="8"
              letterSpacing="2.5"
              fontFamily="serif"
            >
              MAGNA SCIENTIA
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
