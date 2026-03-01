import type { ComponentType } from 'react'
import { LinkedInMockup } from './LinkedInMockup'
import { XMockup } from './XMockup'
import { EmailMockup } from './EmailMockup'

export interface MockupProps {
  headerActions?: React.ReactNode
  footerContent?: React.ReactNode
}

export const MOCKUP_REGISTRY: Record<string, ComponentType<MockupProps>> = {
  linkedin: LinkedInMockup,
  x: XMockup,
  email: EmailMockup,
}

export function getMockupForPlatform(platformId: string): ComponentType<MockupProps> {
  return MOCKUP_REGISTRY[platformId] ?? MOCKUP_REGISTRY.linkedin
}

export { LinkedInMockup } from './LinkedInMockup'
export { XMockup } from './XMockup'
export { EmailMockup } from './EmailMockup'
export { PlatformMockupBase } from './PlatformMockupBase'
