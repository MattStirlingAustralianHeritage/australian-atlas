'use client'

import { LocationProvider } from './LocationProvider'

/**
 * Client-side wrapper that hydrates LocationProvider.
 * savedLocation comes from the server layout (profile data or null).
 */
export default function LocationWrapper({ children, savedLocation }) {
  return (
    <LocationProvider savedLocation={savedLocation}>
      {children}
    </LocationProvider>
  )
}
