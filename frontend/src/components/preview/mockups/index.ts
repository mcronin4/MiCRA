import type { ComponentType } from 'react'
import { LinkedInMockup } from './LinkedInMockup'

export interface MockupProps {
  headerActions?: React.ReactNode
  footerContent?: React.ReactNode
}

export const MOCKUP_REGISTRY: Record<string, ComponentType<MockupProps>> = {
  linkedin: LinkedInMockup,
}

export function getMockupForPlatform(platformId: string): ComponentType<MockupProps> {
  return MOCKUP_REGISTRY[platformId] ?? MOCKUP_REGISTRY.linkedin
}

export { LinkedInMockup } from './LinkedInMockup'
export { PlatformMockupBase } from './PlatformMockupBase'
