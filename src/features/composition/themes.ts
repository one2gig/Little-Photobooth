import { isThemeId, type ThemeId } from '@shared/constants.ts'

export interface ThemeStyle {
  id: ThemeId
  name: string
  blurb: string
  background: string
  backgroundAccent: string
  frame: string
  border: string
  ink: string
  accent: string
  doodle: 'hearts' | 'film' | 'flowers' | 'stars'
  card: string
}

export const THEMES: ThemeStyle[] = [
  {
    id: 'strawberry-milk',
    name: 'Strawberry Milk',
    blurb: 'Pink hearts and bows',
    background: '#FFF0F5',
    backgroundAccent: '#FFD6E5',
    frame: '#FFFDFB',
    border: '#F3A4C0',
    ink: '#7A3148',
    accent: '#E25B88',
    doodle: 'hearts',
    card: '#FFE4EF',
  },
  {
    id: 'midnight-film',
    name: 'Midnight Film',
    blurb: 'Navy borders and sprockets',
    background: '#1B2437',
    backgroundAccent: '#2A3650',
    frame: '#101826',
    border: '#E4D3A8',
    ink: '#F7F1E4',
    accent: '#E4D3A8',
    doodle: 'film',
    card: '#243049',
  },
  {
    id: 'sunday-memories',
    name: 'Sunday Memories',
    blurb: 'Warm beige and flowers',
    background: '#FBF3E6',
    backgroundAccent: '#F3E0C4',
    frame: '#FFFCF7',
    border: '#E2C094',
    ink: '#6B4A2E',
    accent: '#D9894A',
    doodle: 'flowers',
    card: '#F8E7CF',
  },
  {
    id: 'lavender-dreams',
    name: 'Lavender Dreams',
    blurb: 'Lilac clouds and stars',
    background: '#F4EEFF',
    backgroundAccent: '#E4D8FB',
    frame: '#FFFCFF',
    border: '#D4C2F2',
    ink: '#5C4A78',
    accent: '#A78BDB',
    doodle: 'stars',
    card: '#E9DEFF',
  },
]

export function themeById(id: string): ThemeStyle {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]!
}

export function assertTheme(id: string): ThemeId {
  return isThemeId(id) ? id : 'strawberry-milk'
}
