import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { $desktopOnboarding, type DesktopOnboardingState, type OnboardingContext } from '@/store/onboarding'
import { makeOAuthProvider } from '@/test/oauth-provider'
import type { OAuthProvider } from '@/types/kova'

import { Picker } from '.'

function setProviders(providers: OAuthProvider[]) {
  $desktopOnboarding.set({
    configured: false,
    flow: { status: 'idle' },
    mode: 'oauth',
    providers,
    reason: null,
    requested: false,
    firstRunSkipped: false,
    manual: false,
    localEndpoint: false
  } satisfies DesktopOnboardingState)
}

const ctx: OnboardingContext = { requestGateway: async () => undefined as never }

afterEach(() => {
  cleanup()

  try {
    window.localStorage.clear()
  } catch {
    // jsdom localStorage should always be present; ignore if not.
  }

  $desktopOnboarding.set({
    configured: null,
    flow: { status: 'idle' },
    mode: 'oauth',
    providers: null,
    reason: null,
    requested: false,
    firstRunSkipped: false,
    manual: false,
    localEndpoint: false
  })
})

describe('onboarding Picker', () => {
  it('shows all providers flat — no featured card, no disclosure (Kova)', () => {
    setProviders([makeOAuthProvider('anthropic', 'Anthropic Claude'), makeOAuthProvider('nous', 'Nous Portal')])
    render(<Picker ctx={ctx} />)

    expect(screen.getByText('Nous Portal')).toBeTruthy()
    expect(screen.queryByText('Recommended')).toBeNull()
    // Everything is visible immediately: key rows + every OAuth provider.
    expect(screen.getByText('Fireworks AI')).toBeTruthy()
    expect(screen.getByText('Anthropic API Key')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Other providers' })).toBeNull()
  })

  it('shows Fireworks first in the flat list, ahead of other OAuth providers', () => {
    setProviders([
      makeOAuthProvider('openai-codex', 'OpenAI Codex / ChatGPT'),
      makeOAuthProvider('minimax-oauth', 'MiniMax'),
      makeOAuthProvider('nous', 'Nous Portal')
    ])
    render(<Picker ctx={ctx} />)

    const labels = screen
      .getAllByRole('button')
      .map(el => el.textContent ?? '')
      .filter(text => /Nous Portal|Fireworks AI|ChatGPT or Codex|MiniMax|OpenRouter/.test(text))

    const indexOf = (needle: string) => labels.findIndex(text => text.includes(needle))
    // Flat layout: the Fireworks key row leads, then OAuth providers in
    // sortProviders order (curated priority, then name).
    expect(indexOf('Fireworks AI')).toBeGreaterThanOrEqual(0)
    expect(indexOf('Nous Portal')).toBeGreaterThan(indexOf('Fireworks AI'))
    expect(indexOf('ChatGPT or Codex')).toBeGreaterThan(indexOf('Nous Portal'))
    expect(indexOf('MiniMax')).toBeGreaterThan(indexOf('ChatGPT or Codex'))
  })

  it('shows every provider directly when Nous Portal is absent', () => {
    setProviders([
      makeOAuthProvider('anthropic', 'Anthropic Claude'),
      makeOAuthProvider('openai-codex', 'OpenAI Codex / ChatGPT')
    ])
    render(<Picker ctx={ctx} />)

    expect(screen.getByText('Fireworks AI')).toBeTruthy()
    expect(screen.getByText('Anthropic API Key')).toBeTruthy()
    expect(screen.getByText('ChatGPT or Codex Subscription')).toBeTruthy()
    expect(screen.queryByText('Other sign-in options')).toBeNull()
    expect(screen.queryByText('Recommended')).toBeNull()
  })

  it('offers "choose later" on first run and persists the skip', () => {
    setProviders([makeOAuthProvider('nous', 'Nous Portal')])
    render(<Picker ctx={ctx} />)

    const skip = screen.getByRole('button', { name: "I'll choose a provider later" })

    fireEvent.click(skip)

    expect($desktopOnboarding.get().firstRunSkipped).toBe(true)
    expect(window.localStorage.getItem('hermes-onboarding-skipped-v1')).toBe('1')
  })

  it('hides "choose later" in manual (add-provider) mode', () => {
    setProviders([makeOAuthProvider('nous', 'Nous Portal')])
    $desktopOnboarding.set({ ...$desktopOnboarding.get(), manual: true })
    render(<Picker ctx={ctx} />)

    expect(screen.queryByRole('button', { name: "I'll choose a provider later" })).toBeNull()
  })
})
