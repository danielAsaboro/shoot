"use client";

/**
 * Badge overlay for features that are in design phase.
 * Shows a subtle "Phase 2 Design" indicator.
 */

export function DesignPhaseBadge({
  featureKey,
  children,
}: {
  featureKey: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="absolute -top-2 right-3 z-10">
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            borderRadius: 2,
            border: "1px solid rgba(0,240,255,0.3)",
            background: "rgba(0,240,255,0.1)",
            padding: "0.125rem 0.625rem",
            fontFamily: "var(--font-display)",
            fontSize: "0.625rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
            color: "#00F0FF",
          }}
        >
          PHASE 2 DESIGN
        </span>
      </div>
      <div style={{ borderRadius: 4, border: "1px solid rgba(0,240,255,0.1)" }}>
        {children}
      </div>
    </div>
  );
}
