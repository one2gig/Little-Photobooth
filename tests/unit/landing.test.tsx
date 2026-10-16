// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LandingPage } from '../../src/app/screens/LandingPage.tsx'

describe('landing page', () => {
  it('offers create and join without a camera preview', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Create a Booth' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Join a Booth' })).toBeTruthy()
    expect(screen.queryByRole('video')).toBeNull()
    expect(screen.getByText(/Two phones/)).toBeTruthy()
  })
})
