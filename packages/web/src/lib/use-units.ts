'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { createElement } from 'react'

export type Unit = 'km' | 'mi'

const KM_PER_MILE = 1.60934
const STORAGE_KEY = 'fitstake-units'

interface UnitsContextValue {
  unit: Unit
  toggleUnit: () => void
  formatDistance: (cm: number | bigint | null | undefined) => string
  parseToKm: (value: number) => number
}

const UnitsContext = createContext<UnitsContextValue | null>(null)

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [unit, setUnit] = useState<Unit>('km')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'mi' || stored === 'km') {
        setUnit(stored)
      }
    } catch {
      // localStorage unavailable
    }
  }, [])

  const toggleUnit = useCallback(() => {
    setUnit((prev) => {
      const next = prev === 'km' ? 'mi' : 'km'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // localStorage unavailable
      }
      return next
    })
  }, [])

  const formatDistance = useCallback(
    (cm: number | bigint | null | undefined): string => {
      if (cm === null || cm === undefined) return '0'
      const numCm = typeof cm === 'bigint' ? Number(cm) : cm
      const km = numCm / 100_000
      if (unit === 'mi') {
        const miles = km / KM_PER_MILE
        return miles.toFixed(1)
      }
      return km.toFixed(1)
    },
    [unit],
  )

  const parseToKm = useCallback(
    (value: number): number => {
      if (unit === 'mi') {
        return value * KM_PER_MILE
      }
      return value
    },
    [unit],
  )

  return createElement(
    UnitsContext.Provider,
    { value: { unit, toggleUnit, formatDistance, parseToKm } },
    children,
  )
}

export function useUnits(): UnitsContextValue {
  const ctx = useContext(UnitsContext)
  if (!ctx) {
    throw new Error('useUnits must be used within a UnitsProvider')
  }
  return ctx
}
