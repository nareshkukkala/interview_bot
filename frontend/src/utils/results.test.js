import { describe, expect, it } from 'vitest'
import { conceptsToRevisit, previousAttempt, skillRows } from './results.js'
import { questionScore } from './scoring.js'

describe('skillRows', () => {
  const result = {
    criteria: { technical_accuracy: 5, relevance: 5.6, clarity: 4.4, completeness: 4.4 },
    strongestSkill: 'relevance',
    weakestSkill: 'clarity',
  }

  it('lists the four skills with their real averages and tags exactly the strongest and weakest', () => {
    expect(skillRows(result)).toEqual([
      { key: 'technical_accuracy', label: 'Technical accuracy', value: 5, tag: null },
      { key: 'relevance', label: 'Relevance', value: 5.6, tag: 'strongest' },
      { key: 'clarity', label: 'Clarity', value: 4.4, tag: 'weakest' },
      { key: 'completeness', label: 'Completeness', value: 4.4, tag: null },
    ])
  })

  it('tags nothing when the backend names no strongest or weakest skill', () => {
    expect(skillRows({ ...result, strongestSkill: null, weakestSkill: null }).every((r) => r.tag === null)).toBe(true)
  })
})

describe('conceptsToRevisit', () => {
  const q = (...concepts) => ({ evaluation: { missing_concepts: concepts } })

  it('collects the concepts the evaluations reported, de-duplicated and in order', () => {
    expect(conceptsToRevisit([q('GIL', 'asyncio'), q('gil', ' Decorators '), { evaluation: null }, q()])).toEqual(['GIL', 'asyncio', 'Decorators'])
  })

  it('invents nothing when there is nothing to report, and respects the limit', () => {
    expect(conceptsToRevisit([{ evaluation: null }, { skipped: true }])).toEqual([])
    expect(conceptsToRevisit([q('a', 'b', 'c')], 2)).toEqual(['a', 'b'])
  })
})

describe('previousAttempt', () => {
  const session = { id: 's3', completedAt: 3000, config: { jobRole: 'python_developer' } }
  const item = (id, jobRole, completedAt, isSample = false) => ({ id, jobRole, completedAt, isSample, score: 50 })

  it('finds the most recent earlier REAL interview for the same role', () => {
    const history = [item('s3', 'python_developer', 3000), item('s2', 'python_developer', 2000), item('s1', 'python_developer', 1000), item('j1', 'java_developer', 2500)]
    expect(previousAttempt(history, session).id).toBe('s2')
  })

  it('never uses example interviews, other roles, itself or later interviews', () => {
    const history = [item('demo', 'python_developer', 2000, true), item('j1', 'java_developer', 2500), item('s3', 'python_developer', 3000), item('later', 'python_developer', 4000)]
    expect(previousAttempt(history, session)).toBeNull()
  })
})

describe('questionScore', () => {
  const evaluation = { technical_accuracy: 8, relevance: 9, clarity: 7, completeness: 6 }

  it("uses the backend's score for the answer when present", () => {
    expect(questionScore({ evaluation: { ...evaluation, overall_score: 7.5 } })).toBe(7.5)
  })

  it('falls back to the average of the four criteria, and is 0 for skipped or unevaluated questions', () => {
    expect(questionScore({ evaluation })).toBe(7.5)
    expect(questionScore({ skipped: true, evaluation })).toBe(0)
    expect(questionScore({ evaluation: null })).toBe(0)
  })
})
