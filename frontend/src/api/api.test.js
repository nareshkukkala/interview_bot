import { AxiosError } from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import apiClient, { API_BASE_URL } from './client.js'
import { ApiError, SESSION_EXPIRED_MESSAGE } from './errors.js'
import { fetchResults, mapResult, requestEvaluation, startInterview, submitAnswer, toStartPayload } from './interviewApi.js'

const CONFIG = {
  candidateName: 'Priya Sharma',
  jobRole: 'python_developer',
  experience: 'fresher',
  difficulty: 'medium',
  interviewType: 'mixed',
  questionCount: 5,
}

const original = apiClient.defaults.adapter
afterEach(() => {
  apiClient.defaults.adapter = original
})

/** Replaces the network with a fake server; records every request that "reaches" it. */
function fakeServer(handler) {
  const requests = []
  apiClient.defaults.adapter = async (config) => {
    const request = { method: config.method, url: config.url, baseURL: config.baseURL, timeout: config.timeout, body: config.data ? JSON.parse(config.data) : undefined }
    requests.push(request)
    const reply = handler(request)
    const response = { data: reply.data, status: reply.status ?? 200, statusText: '', headers: {}, config, request: {} }
    if (reply.status >= 400) throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, response)
    return response
  }
  return requests
}

const failWith = (code, status, message = 'server message', details = null) => ({ status, data: { error: { code, message, details } } })

async function catchError(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the request to fail')
}

describe('configuration', () => {
  it('uses the backend root from VITE_API_BASE_URL (paths include /api)', () => {
    expect(API_BASE_URL).toBe('http://localhost:8000')
    expect(apiClient.defaults.baseURL).toBe('http://localhost:8000')
  })
})

describe('endpoints', () => {
  it('startInterview → POST /api/interviews/start with the snake_case payload', async () => {
    const requests = fakeServer(() => ({
      status: 201,
      data: {
        session_id: 'abc-123',
        created_at: '2026-11-22T10:00:00Z',
        questions: [{ id: 'python:q1', number: 1, text: 'Q1?', category: 'technical', level: 'beginner', topic: 'Lists', extra: 'ignored' }],
      },
    }))
    const result = await startInterview(CONFIG)

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ method: 'post', url: '/api/interviews/start', baseURL: 'http://localhost:8000' })
    expect(requests[0].body).toEqual({
      candidate_name: 'Priya Sharma',
      job_role: 'python_developer',
      experience: 'fresher',
      difficulty: 'medium',
      interview_type: 'mixed',
      question_count: 5,
    })
    expect(result).toEqual({
      sessionId: 'abc-123',
      createdAt: Date.parse('2026-11-22T10:00:00Z'),
      questions: [{ id: 'python:q1', number: 1, text: 'Q1?', category: 'technical', level: 'beginner', topic: 'Lists' }],
    })
  })

  it('submitAnswer → POST …/submit-answer, for an answer and for a skip', async () => {
    const requests = fakeServer(() => ({ data: { status: 'answered', progress: { answered: 1 } } }))
    await submitAnswer('abc-123', { questionNumber: 2, answer: 'My answer text' })
    await submitAnswer('abc-123', { questionNumber: 3, skipped: true, answer: 'ignored' })

    expect(requests[0]).toMatchObject({ method: 'post', url: '/api/interviews/abc-123/submit-answer' })
    expect(requests[0].body).toEqual({ question_number: 2, skipped: false, answer: 'My answer text' })
    expect(requests[1].body).toEqual({ question_number: 3, skipped: true }) // no answer is sent for a skip
  })

  it('requestEvaluation → POST …/evaluate and keeps only the fields the UI uses', async () => {
    const requests = fakeServer(() => ({
      data: { technical_accuracy: 8, relevance: 9, clarity: 7, completeness: 6, overall_score: 7.5, strengths: ['a'], weaknesses: ['b'], missing_concepts: ['m'], improved_answer: 'x', follow_up_question: 'y', recommended_topic: 't', progress: {}, session_id: 's' },
    }))
    const evaluation = await requestEvaluation('abc-123', 4)

    expect(requests[0]).toMatchObject({ method: 'post', url: '/api/interviews/abc-123/evaluate', body: { question_number: 4 } })
    expect(Object.keys(evaluation).sort()).toEqual(
      ['clarity', 'completeness', 'follow_up_question', 'improved_answer', 'missing_concepts', 'overall_score', 'recommended_topic', 'relevance', 'strengths', 'technical_accuracy', 'weaknesses'],
    )
  })

  it('fetchResults → GET …/results mapped to the shape the results screens use', async () => {
    const requests = fakeServer(() => ({
      data: {
        overall_score: 62,
        performance_label: 'Good',
        criteria_averages: { technical_accuracy: 6, relevance: 7, clarity: 5, completeness: 4 },
        answered_count: 4,
        skipped_count: 1,
        questions: [{ number: 1, score: 7.5, status: 'answered' }, { number: 2, score: 0, status: 'skipped' }],
        strongest_skill: 'relevance',
        weakest_skill: 'completeness',
        strengths: ['s'],
        weaknesses: ['w'],
        learning_recommendations: ['r'],
        summary: 'A concise summary written by Gemini.',
        summary_error: null,
        completed_at: '2026-11-22T10:20:00Z',
      },
    }))
    const result = await fetchResults('abc-123', { durationSec: 412 })

    expect(requests[0]).toMatchObject({ method: 'get', url: '/api/interviews/abc-123/results', timeout: 90000 }) // waits on Gemini for the summary
    expect(result).toEqual({
      overallScore: 62,
      label: 'Good',
      criteria: { technical_accuracy: 6, relevance: 7, clarity: 5, completeness: 4 },
      strongestSkill: 'relevance',
      weakestSkill: 'completeness',
      questionScores: [{ number: 1, score: 7.5, skipped: false }, { number: 2, score: 0, skipped: true }],
      answeredCount: 4,
      skippedCount: 1,
      durationSec: 412,
      strengths: ['s'],
      weaknesses: ['w'],
      recommendations: ['r'],
      summary: 'A concise summary written by Gemini.',
      summaryError: null,
      completedAt: Date.parse('2026-11-22T10:20:00Z'),
    })
  })

  it('maps the new feedback fields and tolerates their absence', async () => {
    fakeServer(() => ({ data: { technical_accuracy: 5, relevance: 5, clarity: 5, completeness: 5, strengths: [], weaknesses: [], improved_answer: 'x', follow_up_question: 'y' } }))
    const evaluation = await requestEvaluation('abc', 1)
    expect(evaluation.missing_concepts).toEqual([])
    expect(evaluation.recommended_topic).toBe('')
  })

  it('gives the Gemini-backed calls a longer timeout than ordinary requests', async () => {
    const requests = fakeServer((r) => ({ status: r.url.endsWith('/start') ? 201 : 200, data: r.url.endsWith('/start') ? { session_id: 's', created_at: '2026-01-01T00:00:00Z', questions: [{ id: 'q1', number: 1, text: 'Q1?', category: 'technical', level: 'beginner', topic: 'T' }] } : { status: 'answered', progress: {}, technical_accuracy: 1, relevance: 1, clarity: 1, completeness: 1, strengths: [], weaknesses: [], improved_answer: '', follow_up_question: '' } }))
    await startInterview(CONFIG)
    await requestEvaluation('s', 1)
    await submitAnswer('s', { questionNumber: 1, answer: 'ten characters!' })
    expect(requests.map((r) => r.timeout)).toEqual([90000, 90000, 20000])
  })

  it('maps a missing summary with its reason, and never makes one up', async () => {
    const report = { overall_score: 40, performance_label: 'Average', criteria_averages: { technical_accuracy: 4, relevance: 4, clarity: 4, completeness: 4 }, questions: [], answered_count: 2, skipped_count: 3, strengths: [], weaknesses: [], learning_recommendations: [], completed_at: '2026-11-22T10:20:00Z' }
    fakeServer(() => ({ data: { ...report, summary: null, summary_error: { code: 'AI_RATE_LIMITED', message: 'busy', ignored: 1 } } }))
    const failed = await fetchResults('abc-123')
    expect(failed.summary).toBeNull()
    expect(failed.summaryError).toEqual({ code: 'AI_RATE_LIMITED', message: 'busy' })
    expect(failed.strongestSkill).toBeNull()

    fakeServer(() => ({ data: report })) // an older/partial response: the fields simply are absent
    const absent = await fetchResults('abc-123')
    expect(absent.summary).toBeNull()
    expect(absent.summaryError).toBeNull()
  })

  it('keeps the backend score of an evaluation', async () => {
    fakeServer(() => ({ data: { technical_accuracy: 8, relevance: 9, clarity: 7, completeness: 6, overall_score: 7.5, strengths: [], weaknesses: [], improved_answer: 'x', follow_up_question: 'y' } }))
    expect((await requestEvaluation('abc', 1)).overall_score).toBe(7.5)
  })

  it('escapes the session id in the URL', async () => {
    const requests = fakeServer(() => ({ data: { status: 'answered', progress: {} } }))
    await submitAnswer('a/b c', { questionNumber: 1, answer: 'ten characters!' })
    expect(requests[0].url).toBe('/api/interviews/a%2Fb%20c/submit-answer')
  })

  it('maps pure helpers', () => {
    expect(toStartPayload(CONFIG).job_role).toBe('python_developer')
    expect(mapResult({ overall_score: 1, performance_label: 'x', criteria_averages: {}, questions: [], answered_count: 0, skipped_count: 0, strengths: [], weaknesses: [], learning_recommendations: [], completed_at: '2026-01-01T00:00:00Z' }).durationSec).toBe(0)
  })
})

describe('error handling', () => {
  it('network failure → friendly message naming the server address', async () => {
    apiClient.defaults.adapter = async (config) => {
      throw new AxiosError('Network Error', 'ERR_NETWORK', config)
    }
    const error = await catchError(startInterview(CONFIG))
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'network', retryable: true })
    expect(error.message).toContain("couldn't reach")
    expect(error.message).toContain('http://localhost:8000')
  })

  it('timeout → friendly message', async () => {
    apiClient.defaults.adapter = async (config) => {
      throw new AxiosError('timeout of 20000ms exceeded', 'ECONNABORTED', config)
    }
    const error = await catchError(requestEvaluation('s', 1))
    expect(error).toMatchObject({ kind: 'timeout', retryable: true })
    expect(error.message).toMatch(/took too long/)
  })

  it('unknown session (404) → session_expired with a clear next step', async () => {
    fakeServer(() => failWith('SESSION_NOT_FOUND', 404, 'technical backend text'))
    const error = await catchError(submitAnswer('gone', { questionNumber: 1, answer: 'ten characters!' }))
    expect(error).toMatchObject({ kind: 'session_expired', code: 'SESSION_NOT_FOUND', status: 404 })
    expect(error.message).toBe(SESSION_EXPIRED_MESSAGE)
  })

  it('validation errors (422) are mapped onto form fields', async () => {
    fakeServer(() =>
      failWith('VALIDATION_ERROR', 422, 'The request is invalid.', [
        { field: 'candidate_name', message: 'Enter a name of 2–50 letters.' },
        { field: 'job_role', message: 'Input should be a valid role' },
      ]),
    )
    const error = await catchError(startInterview(CONFIG))
    expect(error.kind).toBe('validation')
    expect(error.fieldErrors).toEqual({ candidateName: 'Enter a name of 2–50 letters.', jobRole: 'Input should be a valid role' })
    expect(error.message).toBe('Enter a name of 2–50 letters.')
  })

  it.each([
    ['ANSWER_ALREADY_SUBMITTED', 409, /already been submitted/],
    ['RESULTS_NOT_READY', 409, /not been scored yet/],
    ['QUESTION_SKIPPED', 409, /skipped/],
    ['INTERVIEW_COMPLETED', 409, /already finished/],
    ['NOT_ENOUGH_QUESTIONS', 422, /not enough questions/],
  ])('%s → user-friendly text, never the raw backend message', async (code, status, pattern) => {
    fakeServer(() => failWith(code, status, 'RAW technical message (call /evaluate)'))
    const error = await catchError(fetchResults('s'))
    expect(error).toMatchObject({ kind: 'rejected', code })
    expect(error.message).toMatch(pattern)
    expect(error.message).not.toContain('RAW')
  })

  it.each([
    ['AI_NOT_CONFIGURED', 503, 'server', false, /GEMINI_API_KEY/],
    ['AI_AUTH_FAILED', 503, 'server', false, /rejected the API key/],
    ['AI_MODEL_NOT_FOUND', 503, 'server', false, /GEMINI_MODEL/],
    ['AI_RATE_LIMITED', 429, 'rejected', true, /busy or its quota/],
    ['AI_TIMEOUT', 504, 'server', true, /took too long/],
    ['AI_UNAVAILABLE', 503, 'server', true, /temporarily unavailable/],
    ['AI_BAD_RESPONSE', 502, 'server', true, /response we could not use/],
    ['AI_CONTENT_BLOCKED', 422, 'rejected', false, /rewording/],
    ['AI_REQUEST_REJECTED', 502, 'server', false, /rejected the request/],
    ['AI_CALL_LIMIT_REACHED', 429, 'rejected', false, /all of its AI requests/],
  ])('%s → specific message, kind %s, retryable=%s', async (code, status, kind, retryable, pattern) => {
    fakeServer(() => failWith(code, status, 'RAW backend text with details'))
    const error = await catchError(requestEvaluation('s', 1))
    expect(error).toMatchObject({ code, status, kind, retryable })
    expect(error.message).toMatch(pattern)
    expect(error.message).not.toContain('RAW')
  })

  it('server errors (5xx) never expose details', async () => {
    fakeServer(() => failWith('INTERNAL_ERROR', 500, 'Traceback: secret'))
    const error = await catchError(fetchResults('s'))
    expect(error).toMatchObject({ kind: 'server', retryable: true })
    expect(error.message).not.toContain('secret')
  })

  it('a non-JSON error (for example a gateway page) still gives a clear message', async () => {
    fakeServer(() => ({ status: 502, data: '<html>Bad Gateway</html>' }))
    const error = await catchError(fetchResults('s'))
    expect(error).toMatchObject({ kind: 'server', status: 502 })
    expect(error.message).not.toContain('<html>')
  })
})

describe('unexpected responses become clear errors, never crashes', () => {
  const question = { id: 'q1', number: 1, text: 'Q1?', category: 'technical', level: 'beginner', topic: 'Lists' }
  const evaluation = { technical_accuracy: 7, relevance: 8, clarity: 6, completeness: 6, strengths: ['a', 'b', 'c'], weaknesses: ['a', 'b', 'c'], improved_answer: 'x', follow_up_question: 'y' }
  const report = { overall_score: 49, performance_label: 'Average', criteria_averages: { technical_accuracy: 5, relevance: 5, clarity: 5, completeness: 5 }, questions: [{ number: 1, score: 5, status: 'answered' }], answered_count: 1, skipped_count: 0, strengths: [], weaknesses: [], learning_recommendations: [], completed_at: '2026-11-22T10:20:00Z' }
  const start = { session_id: 's', created_at: '2026-01-01T00:00:00Z', questions: [question] }

  const cases = [
    ['start', () => startInterview(CONFIG), [
      ['an empty object', {}], ['null', null], ['an HTML page', '<html>Bad Gateway</html>'], ['an empty string (204)', ''], ['no questions', { ...start, questions: [] }],
      ['a question without text', { ...start, questions: [{ ...question, text: '' }] }], ['an unknown category', { ...start, questions: [{ ...question, category: 'x' }] }],
      ['questions as an object', { ...start, questions: { 0: question } }], ['no session id', { ...start, session_id: undefined }], ['a bad date', { ...start, created_at: 'soon' }],
    ]],
    ['evaluate', () => requestEvaluation('s', 1), [
      ['an empty object', {}], ['null', null], ['an HTML page', '<html></html>'], ['scores as text', { ...evaluation, clarity: 'high' }], ['a score above 10', { ...evaluation, relevance: 11 }],
      ['a negative score', { ...evaluation, completeness: -1 }], ['NaN-like scores', { ...evaluation, technical_accuracy: null }], ['strengths missing', { ...evaluation, strengths: undefined }],
      ['strengths holding numbers', { ...evaluation, strengths: [1, 2, 3] }], ['no ideal answer', { ...evaluation, improved_answer: undefined }],
    ]],
    ['results', () => fetchResults('s'), [
      ['an empty object', {}], ['null', null], ['an HTML page', '<html></html>'], ['an overall score of 150', { ...report, overall_score: 150 }], ['missing criteria', { ...report, criteria_averages: {} }],
      ['questions missing', { ...report, questions: undefined }], ['a bad completion date', { ...report, completed_at: 'whenever' }], ['recommendations as text', { ...report, learning_recommendations: 'study' }],
    ]],
    ['submit-answer', () => submitAnswer('s', { questionNumber: 1, answer: 'ten characters!' }), [['an empty object', {}], ['an unknown status', { status: 'weird', progress: {} }], ['an HTML page', '<html></html>']]],
  ]

  for (const [endpoint, call, bad] of cases) {
    it.each(bad)(`${endpoint}: ${'%s'} → UNEXPECTED_RESPONSE`, async (_label, data) => {
      fakeServer(() => ({ status: endpoint === 'start' ? 201 : 200, data }))
      const error = await catchError(call())
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ code: 'UNEXPECTED_RESPONSE', kind: 'server', retryable: true })
      expect(error.message).toBe('The server sent a response we could not understand. Please try again.')
    })
  }

  it('still accepts the real, complete shapes (and tolerates the optional feedback fields being absent)', async () => {
    fakeServer((r) => ({ status: r.url.endsWith('/start') ? 201 : 200, data: r.url.endsWith('/start') ? start : r.url.endsWith('/evaluate') ? evaluation : r.url.endsWith('/results') ? report : { status: 'answered', progress: {} } }))
    expect((await startInterview(CONFIG)).questions).toHaveLength(1)
    expect((await requestEvaluation('s', 1)).missing_concepts).toEqual([])
    expect((await fetchResults('s')).overallScore).toBe(49)
    expect((await submitAnswer('s', { questionNumber: 1, answer: 'ten characters!' })).status).toBe('answered')
  })
})
