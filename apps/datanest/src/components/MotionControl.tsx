"use client";

import { useEffect, useRef, useState } from "react";

type MotionPreference = "system" | "reduced" | "full";
const STORAGE_KEY = "datanest.motionPreference";
const LEGACY_STORAGE_KEY = "datanest.motionPaused";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function applyMotion(preference: MotionPreference): void {
  const reduced = preference === "reduced" || (preference === "system" && prefersReducedMotion());
  document.documentElement.dataset.motionPaused = String(reduced);
  document.documentElement.dataset.motionPreference = preference;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function MotionControl() {
  const [preference, setPreference] = useState<MotionPreference>("system");
  const preferenceRef = useRef<MotionPreference>("system");

  useEffect(() => {
    const legacyPaused = readStorage(LEGACY_STORAGE_KEY);
    const saved = readStorage(STORAGE_KEY) as MotionPreference | null;
    const initial: MotionPreference =
      saved === "system" || saved === "reduced" || saved === "full"
        ? saved
        : legacyPaused === "true"
          ? "reduced"
          : legacyPaused === "false"
            ? "full"
            : "system";

    preferenceRef.current = initial;
    setPreference(initial);
    applyMotion(initial);

    if (!(saved === "system" || saved === "reduced" || saved === "full") && (legacyPaused === "true" || legacyPaused === "false")) {
      try {
        localStorage.setItem(STORAGE_KEY, initial);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        // Motion preferences remain functional without storage.
      }
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleSystemChange = () => {
      if (preferenceRef.current === "system") applyMotion("system");
    };
    media.addEventListener("change", handleSystemChange);

    return () => media.removeEventListener("change", handleSystemChange);
  }, []);

  function chooseMotion(next: MotionPreference) {
    preferenceRef.current = next;
    setPreference(next);
    applyMotion(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Motion preferences remain functional without storage.
    }
  }

  return (
    <label className="motionControl">
      <span>Motion</span>
      <select
        aria-label="Motion preference"
        value={preference}
        onChange={(event) => chooseMotion(event.target.value as MotionPreference)}
      >
        <option value="system">System</option>
        <option value="reduced">Reduced</option>
        <option value="full">Full</option>
      </select>
    </label>
  );
}
