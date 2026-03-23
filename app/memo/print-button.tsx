"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-[2px] border border-black/10 bg-[#101826] px-4 py-2 text-sm font-medium text-white"
    >
      Print memo
    </button>
  );
}
