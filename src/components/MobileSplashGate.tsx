'use client'
import React, { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'

const SplashScreen = dynamic(() => import('@/src/components/SplashScreen'), { ssr: false })

/**
 * Wraps the mobile app and overlays the splash screen on mobile viewports only.
 * On desktop (>768px), children render immediately with no splash.
 * On mobile, children are hidden until the splash completes so no app chrome
 * (header, tab bar, logo, etc.) flashes through before the animation.
 *
 * Shows on every fresh page load — navigating to /, reopening
 * the PWA, or refreshing the browser tab.
 */
export default function MobileSplashGate({ children }: { children: React.ReactNode }) {
  const [splashDone, setSplashDone] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const mobile = mq.matches
    setIsMobile(mobile)
    setChecked(true)
    // If desktop, skip splash entirely
    if (!mobile) {
      setSplashDone(true)
    }
  }, [])

  const handleComplete = useCallback(() => {
    setSplashDone(true)
  }, [])

  // Desktop: render children immediately, no splash
  if (!checked || (!isMobile && splashDone)) {
    return <>{children}</>
  }

  // Mobile: show splash, then children
  return (
    <>
      {splashDone && children}
      {!splashDone && <SplashScreen onComplete={handleComplete} />}
      {/* Dark cover blocks any header/logo flash while the splash loads */}
      {!splashDone && (
        <div
          className="fixed inset-0 z-[9998]"
          style={{ background: 'linear-gradient(180deg, #0B1220 0%, #0F172A 40%, #0891B2 100%)' }}
        />
      )}
    </>
  )
}
