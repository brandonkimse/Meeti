"use client";
import { useEffect, useState } from "react";

/** A clock that re-renders every `ms` so relative times and ETAs stay fresh. */
export function useNow(ms = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
