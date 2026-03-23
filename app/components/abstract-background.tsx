export function AbstractBackground() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* ── Atmospheric depth: radial glows ─────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 80% 50% at 15% 85%, rgba(0,90,80,0.18) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 85% 75%, rgba(40,0,80,0.22) 0%, transparent 55%),
            radial-gradient(ellipse 100% 60% at 50% 100%, rgba(0,40,60,0.3) 0%, transparent 50%),
            radial-gradient(ellipse 40% 30% at 30% 60%, rgba(0,200,220,0.04) 0%, transparent 50%),
            radial-gradient(ellipse 30% 20% at 70% 50%, rgba(100,0,160,0.06) 0%, transparent 50%)
          `,
        }}
      />

      {/* ── Mountain silhouettes ─────────────────────────────────── */}
      <svg
        viewBox="0 0 1440 400"
        preserveAspectRatio="xMidYMax meet"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          width: "100%",
          height: "auto",
        }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="mtn-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d1a2a" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#060c14" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="mtn-mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#091520" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#040b10" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="mtn-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#05100a" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#030806" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="mtn-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#030808" stopOpacity="1" />
            <stop offset="100%" stopColor="#050505" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="glow-horizon" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.06" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </linearGradient>
          <filter id="blur-far">
            <feGaussianBlur stdDeviation="2" />
          </filter>
          <filter id="blur-mid">
            <feGaussianBlur stdDeviation="1" />
          </filter>
        </defs>

        {/* Horizon glow */}
        <rect
          x="0"
          y="200"
          width="1440"
          height="200"
          fill="url(#glow-horizon)"
        />

        {/* Far mountains — blurry, distant */}
        <path
          d="M0 340 L60 280 L110 310 L160 250 L220 285 L280 230 L340 265 L400 220 L460 255 L520 215 L580 250 L640 200 L700 240 L760 195 L820 235 L880 210 L940 245 L1000 200 L1060 240 L1120 215 L1180 245 L1240 210 L1300 250 L1360 220 L1440 260 L1440 400 L0 400 Z"
          fill="url(#mtn-far)"
          filter="url(#blur-far)"
        />

        {/* Mid mountains */}
        <path
          d="M0 370 L80 310 L130 340 L190 280 L250 320 L310 265 L380 305 L440 260 L510 295 L570 250 L630 285 L700 235 L760 270 L820 230 L890 268 L950 240 L1010 272 L1070 248 L1130 278 L1190 252 L1250 282 L1310 258 L1380 290 L1440 268 L1440 400 L0 400 Z"
          fill="url(#mtn-mid)"
          filter="url(#blur-mid)"
        />

        {/* Near ridgeline with subtle pine-tree texture via small triangles */}
        <path
          d="M0 390 L50 345 L75 360 L100 330 L130 350 L160 310 L195 335 L220 300 L250 325 L285 295 L315 320 L350 285 L385 310 L420 275 L455 300 L490 268 L525 295 L560 270 L600 295 L640 265 L680 290 L720 260 L760 285 L800 258 L840 282 L880 260 L920 284 L965 255 L1000 278 L1040 260 L1080 282 L1120 258 L1165 280 L1200 260 L1245 285 L1285 265 L1320 285 L1360 265 L1400 282 L1440 268 L1440 400 L0 400 Z"
          fill="url(#mtn-near)"
        />

        {/* Forest floor */}
        <rect x="0" y="380" width="1440" height="20" fill="url(#mtn-floor)" />

        {/* Subtle cyan ridge highlight */}
        <path
          d="M220 300 L250 325 L285 295 L315 320 L350 285"
          fill="none"
          stroke="rgba(0,240,255,0.08)"
          strokeWidth="1"
        />
        <path
          d="M720 260 L760 285 L800 258 L840 282"
          fill="none"
          stroke="rgba(0,240,255,0.06)"
          strokeWidth="1"
        />
      </svg>

      {/* ── Subtle noise texture overlay ─────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "160px 160px",
          opacity: 0.018,
          mixBlendMode: "overlay",
        }}
      />
    </div>
  );
}
