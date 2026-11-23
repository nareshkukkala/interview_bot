// Interview configuration options — values match the backend enums in docs/ARCHITECTURE.md §5.1

export const QUESTION_COUNT = 5 // fixed for the MVP (PRD BR-01)
export const ANSWER_MIN = 10
export const ANSWER_MAX = 2000

export const ROLES = [
  { value: 'python_developer', label: 'Python Developer' },
  { value: 'java_developer', label: 'Java Developer' },
  { value: 'frontend_developer', label: 'Frontend Developer' },
  { value: 'backend_developer', label: 'Backend Developer' },
  { value: 'full_stack_developer', label: 'Full Stack Developer' },
  { value: 'data_analyst', label: 'Data Analyst' },
  { value: 'ml_engineer', label: 'Machine Learning Engineer' },
]

export const EXPERIENCE_LEVELS = [
  { value: 'fresher', label: 'Fresher' },
  { value: '0_1_years', label: '0–1 years' },
  { value: '1_3_years', label: '1–3 years' },
  { value: '3_plus_years', label: '3+ years' },
]

export const DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

export const INTERVIEW_TYPES = [
  { value: 'technical', label: 'Technical', description: '5 role-specific technical questions' },
  { value: 'hr', label: 'HR', description: '5 behavioural and HR questions' },
  { value: 'mixed', label: 'Mixed', description: '3 technical and 2 HR questions' },
]

export const CRITERIA = [
  { key: 'technical_accuracy', label: 'Technical accuracy' },
  { key: 'relevance', label: 'Relevance' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'completeness', label: 'Completeness' },
]

export function labelFor(options, value) {
  return options.find((option) => option.value === value)?.label ?? value
}
