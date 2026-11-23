import { describe, expect, it } from 'vitest'
import { validateAnswer, validateSetup } from './validation.js'

const valid = {
  candidateName: 'Priya Sharma',
  jobRole: 'python_developer',
  experience: 'fresher',
  difficulty: 'medium',
  interviewType: 'mixed',
  questionCount: 5,
}

describe('validateSetup', () => {
  it('accepts a valid configuration', () => {
    expect(validateSetup(valid)).toEqual({})
  })

  it.each([
    ['', 'empty'],
    ['A', 'too short'],
    ['Pr1ya', 'digits'],
    ['x'.repeat(51), 'too long'],
    ['   ', 'whitespace only'],
  ])('rejects the name %j (%s)', (candidateName) => {
    expect(validateSetup({ ...valid, candidateName })).toHaveProperty('candidateName')
  })

  it.each(['José Álvarez', 'Zoë Müller', 'Nguyễn Văn An', '李雷', 'प्रिया शर्मा', 'O’Neil', 'Ana-María', 'e\u0301lise'])(
    'accepts the real name %j (any script, curly apostrophe, decomposed accents)',
    (candidateName) => {
      expect(validateSetup({ ...valid, candidateName })).toEqual({})
    },
  )

  it.each(['Priya2', 'Priya<script>', 'Priya 😀', '😀😀', '-Priya', "'Priya", 'Priya_Sharma', 'Pri\u0000ya'])(
    'rejects the non-name %j',
    (candidateName) => {
      expect(validateSetup({ ...valid, candidateName })).toHaveProperty('candidateName')
    },
  )

  it('counts characters, not UTF-16 units: 50 accented letters are fine, 51 are not', () => {
    expect(validateSetup({ ...valid, candidateName: 'é'.repeat(50) })).toEqual({})
    expect(validateSetup({ ...valid, candidateName: 'é'.repeat(51) })).toHaveProperty('candidateName')
    expect(validateSetup({ ...valid, candidateName: '李'.repeat(50) })).toEqual({})
  })

  it("accepts names with spaces, dots, apostrophes and hyphens", () => {
    expect(validateSetup({ ...valid, candidateName: "Mary-Jane O'Neil Jr." })).toEqual({})
  })

  it('rejects values outside the allowed options', () => {
    const errors = validateSetup({ ...valid, jobRole: 'chef', experience: 'x', difficulty: 'insane', interviewType: 'panel', questionCount: 7 })
    expect(Object.keys(errors).sort()).toEqual(['difficulty', 'experience', 'interviewType', 'jobRole', 'questionCount'])
  })
})

describe('validateAnswer', () => {
  it('prevents empty and too-short answers', () => {
    expect(validateAnswer('')).toMatch(/at least 10/)
    expect(validateAnswer('          ')).toMatch(/at least 10/)
    expect(validateAnswer('too short')).toMatch(/at least 10/)
  })

  it('accepts a normal answer and rejects one over 2,000 characters', () => {
    expect(validateAnswer('This is a proper answer.')).toBeNull()
    expect(validateAnswer('x'.repeat(2001))).toMatch(/2,000/)
  })
})
