import { describe, expect, it } from 'vitest'
import {
  STATUS,
  completeSession,
  createSession,
  getProgress,
  isActive,
  mergeResponses,
  needsScoring,
  nextUnresolvedIndex,
  sessionReducer,
} from './sessionModel.js'

const CONFIG = {
  candidateName: 'Priya Sharma',
  jobRole: 'python_developer',
  experience: 'fresher',
  difficulty: 'medium',
  interviewType: 'mixed',
  questionCount: 5,
}

// Questions exactly as the backend serves them
const QUESTIONS = [1, 2, 3, 4, 5].map((number) => ({
  id: `python:q${number}`,
  number,
  text: `Question ${number}?`,
  category: number <= 3 ? 'technical' : 'hr',
  level: 'intermediate',
  topic: `Topic ${number}`,
}))

const EVALUATION = {
  technical_accuracy: 8,
  relevance: 9,
  clarity: 7,
  completeness: 6,
  strengths: ['Clear'],
  weaknesses: ['Short'],
  improved_answer: 'Better answer',
  follow_up_question: 'Why?',
}

const RESULT = { overallScore: 60, label: 'Good', answeredCount: 4, skippedCount: 1, durationSec: 30 }

const fresh = () => createSession({ id: 'session-1', config: CONFIG, questions: QUESTIONS, now: 0 })
const qid = (session, index) => session.questions[index].id

/** Applies a list of actions in order. */
const run = (state, ...actions) => actions.reduce(sessionReducer, state)

/** The full happy path for one question: draft → submit_request → answer stored → scored. */
const answer = (session, index, text = 'A complete answer with detail.') => [
  { type: 'go_to', index },
  { type: 'set_draft', questionId: qid(session, index), text },
  { type: 'submit_request', questionId: qid(session, index) },
  { type: 'answer_stored', questionId: qid(session, index), answer: text },
  { type: 'submit_success', questionId: qid(session, index), answer: text, evaluation: EVALUATION },
]

describe('createSession', () => {
  it('uses the id and questions served by the backend and starts on question 1', () => {
    const s = fresh()
    expect(s.id).toBe('session-1')
    expect(s.status).toBe('in_progress')
    expect(s.currentIndex).toBe(0)
    expect(s.questions).toEqual(QUESTIONS)
    expect(Object.values(s.responses).every((r) => r.status === STATUS.UNANSWERED && r.draft === '')).toBe(true)
    expect(getProgress(s)).toMatchObject({ answered: 0, skipped: 0, remaining: 5, allResolved: false })
  })
})

describe('drafts and navigation', () => {
  it('keeps drafts per question across Previous / Next', () => {
    const s0 = fresh()
    const s = run(
      s0,
      { type: 'set_draft', questionId: qid(s0, 0), text: 'first draft' },
      { type: 'next' },
      { type: 'set_draft', questionId: qid(s0, 1), text: 'second draft' },
      { type: 'previous' },
    )
    expect(s.currentIndex).toBe(0)
    expect(s.responses[qid(s0, 0)].draft).toBe('first draft')
    expect(s.responses[qid(s0, 1)].draft).toBe('second draft')
  })

  it('keeps Previous / Next / go_to inside bounds', () => {
    const s0 = fresh()
    expect(run(s0, { type: 'previous' }).currentIndex).toBe(0)
    expect(run(s0, { type: 'go_to', index: 4 }, { type: 'next' }).currentIndex).toBe(4)
    expect(run(s0, { type: 'go_to', index: 9 })).toBe(s0)
  })
})

describe('submitting answers', () => {
  it('stores the answer and evaluation and locks the question', () => {
    const s0 = fresh()
    const s = run(s0, ...answer(s0, 0, 'Final answer text'))
    const r = s.responses[qid(s0, 0)]
    expect(r.status).toBe(STATUS.ANSWERED)
    expect(r.answer).toBe('Final answer text')
    expect(r.evaluation).toEqual(EVALUATION)
    expect(needsScoring(r)).toBe(false)

    const edited = run(s, { type: 'set_draft', questionId: qid(s0, 0), text: 'sneaky edit' })
    expect(edited.responses[qid(s0, 0)].draft).toBe('Final answer text') // locked after submit (PRD BR-10)
  })

  it('prevents duplicate submissions', () => {
    const s0 = fresh()
    const id = qid(s0, 0)
    const inFlight = run(s0, { type: 'set_draft', questionId: id, text: 'x'.repeat(20) }, { type: 'submit_request', questionId: id })
    expect(run(inFlight, { type: 'submit_request', questionId: id })).toBe(inFlight) // second request ignored

    const done = run(
      inFlight,
      { type: 'answer_stored', questionId: id, answer: 'first' },
      { type: 'submit_success', questionId: id, answer: 'first', evaluation: EVALUATION },
    )
    const again = run(done, { type: 'submit_success', questionId: id, answer: 'second', evaluation: { ...EVALUATION, relevance: 1 } })
    expect(again.responses[id].answer).toBe('first') // late duplicate result ignored
    expect(run(done, { type: 'submit_request', questionId: id })).toBe(done)
  })

  it('returns to the previous status when storing the answer fails, keeping the draft', () => {
    const s0 = fresh()
    const id = qid(s0, 0)
    const s = run(
      s0,
      { type: 'set_draft', questionId: id, text: 'my draft answer' },
      { type: 'submit_request', questionId: id },
      { type: 'submit_failure', questionId: id, error: "Can't reach the server" },
    )
    expect(s.responses[id]).toMatchObject({ status: STATUS.UNANSWERED, error: "Can't reach the server", draft: 'my draft answer', answer: null })
    // and the user can simply submit again
    expect(run(s, { type: 'submit_request', questionId: id }).responses[id].status).toBe(STATUS.EVALUATING)
  })

  it('a skipped question that fails to store goes back to skipped', () => {
    const s0 = fresh()
    const id = qid(s0, 0)
    const s = run(
      s0,
      { type: 'skip', questionId: id },
      { type: 'go_to', index: 0 },
      { type: 'set_draft', questionId: id, text: 'answering a skipped one' },
      { type: 'submit_request', questionId: id },
      { type: 'submit_failure', questionId: id, error: 'Boom' },
    )
    expect(s.responses[id]).toMatchObject({ status: STATUS.SKIPPED, error: 'Boom', draft: 'answering a skipped one' })
  })

  it('keeps a stored answer as answered when only scoring fails, and allows retrying the scoring', () => {
    const s0 = fresh()
    const id = qid(s0, 0)
    const failed = run(
      s0,
      { type: 'set_draft', questionId: id, text: 'a stored answer' },
      { type: 'submit_request', questionId: id },
      { type: 'answer_stored', questionId: id, answer: 'a stored answer' },
      { type: 'submit_failure', questionId: id, error: 'Scoring timed out' },
    )
    const r = failed.responses[id]
    expect(r).toMatchObject({ status: STATUS.ANSWERED, answer: 'a stored answer', evaluation: null, error: 'Scoring timed out' })
    expect(needsScoring(r)).toBe(true)
    expect(getProgress(failed)).toMatchObject({ answered: 1, remaining: 4 })

    // the stored answer cannot be submitted again, only re-scored
    expect(run(failed, { type: 'submit_request', questionId: id })).toBe(failed)
    const retrying = run(failed, { type: 'evaluate_request', questionId: id })
    expect(retrying.responses[id].status).toBe(STATUS.EVALUATING)
    expect(run(retrying, { type: 'evaluate_request', questionId: id })).toBe(retrying) // no double retry

    const scored = run(retrying, { type: 'submit_success', questionId: id, answer: 'a stored answer', evaluation: EVALUATION })
    expect(scored.responses[id]).toMatchObject({ status: STATUS.ANSWERED, evaluation: EVALUATION, error: null })

    const failedAgain = run(retrying, { type: 'submit_failure', questionId: id, error: 'Still down' })
    expect(failedAgain.responses[id]).toMatchObject({ status: STATUS.ANSWERED, evaluation: null, error: 'Still down' })
  })

  it('cannot retry scoring on an answer that is already scored', () => {
    const s0 = fresh()
    const s = run(s0, ...answer(s0, 0))
    expect(run(s, { type: 'evaluate_request', questionId: qid(s0, 0) })).toBe(s)
  })

  it('ignores results that belong to a different session', () => {
    const s0 = fresh()
    expect(run(s0, { type: 'next', sessionId: 'other' })).toBe(s0)
  })
})

describe('skipping', () => {
  it('marks the question skipped and moves to the next unresolved question', () => {
    const s0 = fresh()
    const s = run(s0, ...answer(s0, 1), { type: 'go_to', index: 0 }, { type: 'skip', questionId: qid(s0, 0) })
    expect(s.responses[qid(s0, 0)].status).toBe(STATUS.SKIPPED)
    expect(s.currentIndex).toBe(2) // question 2 is already answered, so it jumps to 3
  })

  it('lets a skipped question be answered later', () => {
    const s0 = fresh()
    const s = run(s0, { type: 'skip', questionId: qid(s0, 0) }, ...answer(s0, 0))
    expect(s.responses[qid(s0, 0)].status).toBe(STATUS.ANSWERED)
    expect(getProgress(s)).toMatchObject({ answered: 1, skipped: 0 })
  })

  it('cannot skip an answered question', () => {
    const s0 = fresh()
    const s = run(s0, ...answer(s0, 0))
    expect(run(s, { type: 'skip', questionId: qid(s0, 0) })).toBe(s)
  })
})

describe('timer', () => {
  it('adds time to the current question only while it is open', () => {
    const s0 = fresh()
    const s = run(s0, { type: 'tick' }, { type: 'tick' }, { type: 'next' }, { type: 'tick' })
    expect(s.responses[qid(s0, 0)].timeSpent).toBe(2)
    expect(s.responses[qid(s0, 1)].timeSpent).toBe(1)
    const answered = run(s, ...answer(s0, 1), { type: 'tick' })
    expect(answered.responses[qid(s0, 1)].timeSpent).toBe(1) // paused after submission
  })
})

describe('finishing', () => {
  it('moves to finishing, then completes: unresolved questions become skipped and the server result is attached', () => {
    const s0 = fresh()
    const answered = run(s0, ...answer(s0, 0), ...answer(s0, 2))
    const finishing = run(answered, { type: 'finish_request' })
    expect(finishing.status).toBe('finishing')
    // the request alone changes nothing about the answers: the server decides what is recorded
    expect(getProgress(finishing)).toMatchObject({ answered: 2, skipped: 0, remaining: 3 })

    const done = run(finishing, { type: 'finish_success', result: RESULT, completedAt: 123 })
    expect(done.status).toBe('completed')
    expect(done.result).toBe(RESULT)
    expect(done.completedAt).toBe(123)
    expect(getProgress(done)).toMatchObject({ answered: 2, skipped: 3, allResolved: true })
    // locked after completion
    expect(run(done, { type: 'go_to', index: 3 })).toBe(done)
  })

  it('merges evaluations that were fetched while finishing', () => {
    const s0 = fresh()
    const id = qid(s0, 0)
    const unscored = run(
      s0,
      { type: 'set_draft', questionId: id, text: 'stored but unscored' },
      { type: 'submit_request', questionId: id },
      { type: 'answer_stored', questionId: id, answer: 'stored but unscored' },
      { type: 'submit_failure', questionId: id, error: 'down' },
      { type: 'finish_request' },
    )
    const done = run(unscored, { type: 'finish_success', result: RESULT, completedAt: 1, evaluations: { [id]: EVALUATION } })
    expect(done.responses[id]).toMatchObject({ status: STATUS.ANSWERED, evaluation: EVALUATION, error: null })
  })

  it('returns to the room when finishing fails, keeping everything', () => {
    const s0 = fresh()
    const answered = run(s0, ...answer(s0, 0))
    const failed = run(answered, { type: 'finish_request' }, { type: 'finish_failure' })
    expect(failed.status).toBe('in_progress')
    expect(failed.responses).toEqual(answered.responses)
  })

  it('will not finish while an answer is being evaluated', () => {
    const s0 = fresh()
    const s = run(s0, { type: 'set_draft', questionId: qid(s0, 0), text: 'x'.repeat(20) }, { type: 'submit_request', questionId: qid(s0, 0) })
    expect(run(s, { type: 'finish_request' })).toBe(s)
  })

  it('completeSession builds the stored copy used for history', () => {
    const s0 = fresh()
    const s = completeSession(run(s0, ...answer(s0, 0)), { result: RESULT, completedAt: 5 })
    expect(s).toMatchObject({ status: 'completed', completedAt: 5, result: RESULT })
    expect(mergeResponses(s).map((q) => q.skipped)).toEqual([false, true, true, true, true])
  })
})

describe('refreshing a completed result', () => {
  it('replaces the stored report (for example when a missing AI summary is retried) without touching anything else', () => {
    const done = run(fresh(), { type: 'finish_request' }, { type: 'finish_success', result: RESULT, completedAt: 1 })
    const refreshed = run(done, { type: 'result_updated', sessionId: 'session-1', result: { ...RESULT, summary: 'Now there is a summary.' } })
    expect(refreshed.result.summary).toBe('Now there is a summary.')
    expect(refreshed.responses).toBe(done.responses)
    expect(refreshed.status).toBe('completed')
  })

  it('does nothing for an interview that is not completed, or for another session', () => {
    const s0 = fresh()
    expect(run(s0, { type: 'result_updated', sessionId: 'session-1', result: RESULT })).toBe(s0)
    const done = run(s0, { type: 'finish_request' }, { type: 'finish_success', result: RESULT, completedAt: 1 })
    expect(run(done, { type: 'result_updated', sessionId: 'other', result: { ...RESULT, summary: 'x' } })).toBe(done)
  })
})

describe('expired sessions', () => {
  it('marks an active session as expired and stops all further changes', () => {
    const s0 = fresh()
    const s = run(s0, { type: 'session_expired', sessionId: 'session-1' })
    expect(s.status).toBe('expired')
    expect(isActive(s)).toBe(false)
    expect(run(s, { type: 'next' })).toBe(s)
    expect(run(s, { type: 'set_draft', questionId: qid(s0, 0), text: 'x' })).toBe(s)
  })

  it('also applies when it happens while finishing', () => {
    const s = run(fresh(), { type: 'finish_request' }, { type: 'session_expired' })
    expect(s.status).toBe('expired')
  })

  it('ignores an expiry for a different session and never changes a completed one', () => {
    const s0 = fresh()
    expect(run(s0, { type: 'session_expired', sessionId: 'other' })).toBe(s0)
    const done = run(s0, { type: 'finish_request' }, { type: 'finish_success', result: RESULT, completedAt: 1 })
    expect(run(done, { type: 'session_expired' })).toBe(done)
  })
})

describe('full flow', () => {
  it('answers, skips, revisits and finishes', () => {
    const s0 = fresh()
    let s = run(s0, ...answer(s0, 0)) // Q1 answered
    s = run(s, { type: 'go_to', index: 1 }, { type: 'skip', questionId: qid(s0, 1) }) // Q2 skipped → Q3
    expect(s.currentIndex).toBe(2)
    s = run(s, ...answer(s0, 2), ...answer(s0, 3), ...answer(s0, 4))
    expect(nextUnresolvedIndex(s)).toBe(-1) // skipped counts as resolved, so nothing is left open
    expect(getProgress(s)).toMatchObject({ answered: 4, skipped: 1, remaining: 0, allResolved: true })

    s = run(s, { type: 'finish_request' }, { type: 'finish_success', result: RESULT, completedAt: 9 })
    expect(s.status).toBe('completed')
    expect(s.result.overallScore).toBe(60)
  })
})
