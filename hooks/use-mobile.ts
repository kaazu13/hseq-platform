import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Rewritten from the shadcn-generated version, which called `setState`
 * synchronously inside a `useEffect` body to seed the initial value —
 * flagged by this project's `react-hooks/set-state-in-effect` lint rule.
 * `useSyncExternalStore` is the purpose-built React API for "subscribe to
 * an external mutable source and read its current value, safely across
 * SSR/hydration" (exactly this case), so it replaces the effect entirely
 * rather than just silencing the lint rule.
 */
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
