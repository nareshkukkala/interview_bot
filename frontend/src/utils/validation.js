import {
  ANSWER_MAX,
  ANSWER_MIN,
  DIFFICULTIES,
  EXPERIENCE_LEVELS,
  INTERVIEW_TYPES,
  QUESTION_COUNT,
  ROLES,
} from '../constants/options.js'

// A name starts with a letter and may contain letters of any script, combining marks, spaces, and . ' ’ -
// (José, Nguyễn, O’Neil, 李雷, प्रिया). Digits, symbols and emoji are rejected. The backend applies the same rule.
const NAME_PATTERN = /^\p{L}[\p{L}\p{M} .'’-]*$/u

/** 2–50 characters (counted as characters, not UTF-16 units) matching NAME_PATTERN. */
export function isValidName(value) {
  const name = value.trim().normalize('NFC')
  const length = [...name].length
  return length >= 2 && length <= 50 && NAME_PATTERN.test(name)
}

const isOneOf = (options, value) => options.some((option) => option.value === value)

/** Validates the interview setup form (PRD §7). Returns { field: message } for invalid fields. */
export function validateSetup(form) {
  const errors = {}
  if (!isValidName(form.candidateName)) {
    errors.candidateName = 'Enter a name of 2–50 letters. Spaces, dots, apostrophes and hyphens are allowed.'
  }
  if (!isOneOf(ROLES, form.jobRole)) errors.jobRole = 'Select a job role.'
  if (!isOneOf(EXPERIENCE_LEVELS, form.experience)) errors.experience = 'Select your experience level.'
  if (!isOneOf(DIFFICULTIES, form.difficulty)) errors.difficulty = 'Select a difficulty level.'
  if (!isOneOf(INTERVIEW_TYPES, form.interviewType)) errors.interviewType = 'Select an interview type.'
  if (form.questionCount !== QUESTION_COUNT) errors.questionCount = `Interviews have ${QUESTION_COUNT} questions.`

  return errors
}

/** Returns an error message, or null if the answer is valid. */
export function validateAnswer(text) {
  const length = text.trim().length
  if (length < ANSWER_MIN) return `Write at least ${ANSWER_MIN} characters, or skip this question.`
  if (length > ANSWER_MAX) return `Keep your answer under ${ANSWER_MAX.toLocaleString()} characters.`
  return null
}
