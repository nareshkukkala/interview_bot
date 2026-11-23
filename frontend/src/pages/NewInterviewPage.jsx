import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Clock3, ListChecks, Lock, Play } from 'lucide-react'
import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import { ChoiceField, SelectField, TextField } from '../components/ui/FormControls.jsx'
import LoadingScreen from '../components/ui/LoadingScreen.jsx'
import Modal from '../components/ui/Modal.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { useApp } from '../context/useApp.js'
import { LEVEL_LABELS, DIFFICULTY_TO_LEVEL } from '../features/interview/levels.js'
import { useConfirmDialog } from '../hooks/useConfirmDialog.js'
import { useInterviewSession } from '../hooks/useInterviewSession.js'
import {
  DIFFICULTIES,
  EXPERIENCE_LEVELS,
  INTERVIEW_TYPES,
  QUESTION_COUNT,
  ROLES,
  labelFor,
} from '../constants/options.js'
import { validateSetup } from '../utils/validation.js'

const FIELD_ORDER = ['candidateName', 'jobRole', 'experience', 'difficulty', 'interviewType', 'questionCount']

export default function NewInterviewPage() {
  const { settings, activeSession } = useApp()
  const { start } = useInterviewSession()
  const starting = useRef(false) // blocks a second start while the first request is in flight
  const confirm = useConfirmDialog()
  const [preparing, setPreparing] = useState(false)
  const [startError, setStartError] = useState(null)
  const navigate = useNavigate()
  const prefill = useLocation().state?.prefill // set by "Retake Interview" on the results page
  const [form, setForm] = useState({
    candidateName: prefill?.candidateName ?? settings.candidateName,
    jobRole: prefill?.jobRole ?? settings.jobRole,
    experience: prefill?.experience ?? settings.experience,
    difficulty: prefill?.difficulty ?? settings.difficulty,
    interviewType: prefill?.interviewType ?? settings.interviewType,
    questionCount: QUESTION_COUNT,
  })
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)

  const update = (field, value) => {
    const next = { ...form, [field]: value }
    setForm(next)
    if (submitted) setErrors(validateSetup(next))
  }

  const onSubmit = (event) => {
    event.preventDefault()
    setSubmitted(true)
    const found = validateSetup(form)
    setErrors(found)
    const firstInvalid = FIELD_ORDER.find((field) => found[field])
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus()
      return
    }
    if (activeSession) {
      confirm.open('replace')
      return
    }
    begin()
  }

  const begin = async () => {
    if (starting.current) return
    starting.current = true
    confirm.close()
    setStartError(null)
    setPreparing(true)
    try {
      // The interview in progress (if any) is only replaced once the server has created the new one
      const id = await start({ ...form, candidateName: form.candidateName.trim() })
      navigate(`/interview/${id}`)
    } catch (error) {
      // Server-side validation messages go next to the fields they belong to
      if (error.kind === 'validation' && Object.keys(error.fieldErrors).length) setErrors(error.fieldErrors)
      setStartError(error.message ?? 'We could not start the interview. Please try again.')
      setPreparing(false)
    } finally {
      starting.current = false
    }
  }

  const type = INTERVIEW_TYPES.find((t) => t.value === form.interviewType)

  if (preparing) {
    return (
      <LoadingScreen
        title="Preparing your questions"
        description={`Writing ${QUESTION_COUNT} ${LEVEL_LABELS[DIFFICULTY_TO_LEVEL[form.difficulty]].toLowerCase()}-level questions for ${labelFor(ROLES, form.jobRole)}. This can take a few seconds.`}
      />
    )
  }

  return (
    <>
      <PageHeader
        title="Set up your interview"
        description="Choose the role and level you are preparing for. Questions and feedback are tailored to these choices."
      />

      <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="space-y-7">
          <TextField
            id="candidateName"
            label="Your name"
            placeholder="e.g. Priya Sharma"
            autoComplete="name"
            maxLength={50}
            value={form.candidateName}
            onChange={(e) => update('candidateName', e.target.value)}
            error={errors.candidateName}
          />

          <div className="grid gap-7 sm:grid-cols-2">
            <SelectField
              id="jobRole"
              label="Job role"
              options={ROLES}
              placeholder="Select a role"
              value={form.jobRole}
              onChange={(e) => update('jobRole', e.target.value)}
              error={errors.jobRole}
            />
            <SelectField
              id="experience"
              label="Experience"
              options={EXPERIENCE_LEVELS}
              placeholder="Select experience"
              value={form.experience}
              onChange={(e) => update('experience', e.target.value)}
              error={errors.experience}
            />
          </div>

          <ChoiceField
            id="difficulty"
            label="Difficulty"
            options={DIFFICULTIES}
            value={form.difficulty}
            onChange={(value) => update('difficulty', value)}
            error={errors.difficulty}
            hint="Easy uses beginner questions, Medium intermediate and Hard advanced. Harder levels are also scored more strictly."
          />

          <ChoiceField
            id="interviewType"
            label="Interview type"
            options={INTERVIEW_TYPES}
            value={form.interviewType}
            onChange={(value) => update('interviewType', value)}
            error={errors.interviewType}
          />

          <div>
            <label htmlFor="questionCount" className="mb-2 block text-sm font-medium text-white">
              Number of questions
            </label>
            <div className="relative sm:max-w-56">
              <input
                id="questionCount"
                value={`${QUESTION_COUNT} questions`}
                readOnly
                aria-describedby="questionCount-hint"
                className="h-11 w-full cursor-not-allowed rounded-lg border border-line bg-surface/60 px-3.5 text-[0.9375rem] text-muted"
              />
              <Lock className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
            </div>
            <p id="questionCount-hint" className="mt-2 text-sm text-faint">
              {errors.questionCount ?? 'Every interview has 5 questions in this version.'}
            </p>
          </div>
        </Card>

        <aside className="lg:sticky lg:top-10 lg:self-start">
          <Card>
            <h2 className="text-base font-semibold text-white">Your interview</h2>
            <dl className="mt-5 space-y-4 text-sm">
              {[
                ['Role', labelFor(ROLES, form.jobRole)],
                ['Experience', labelFor(EXPERIENCE_LEVELS, form.experience)],
                ['Difficulty', `${labelFor(DIFFICULTIES, form.difficulty)} (${LEVEL_LABELS[DIFFICULTY_TO_LEVEL[form.difficulty]]})`],
                ['Type', type?.label],
              ].map(([term, value]) => (
                <div key={term} className="flex justify-between gap-4">
                  <dt className="text-muted">{term}</dt>
                  <dd className="text-right font-medium text-white">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 space-y-3 border-t border-line pt-5 text-sm text-muted">
              <p className="flex gap-2.5">
                <ListChecks className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden="true" />
                {type?.description}, one at a time
              </p>
              <p className="flex gap-2.5">
                <Clock3 className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden="true" />
                No time limit: take as long as you need
              </p>
            </div>
            <Button type="submit" size="lg" className="mt-6 w-full">
              <Play aria-hidden="true" />
              Start interview
            </Button>
            {startError && <Alert className="mt-4">{startError}</Alert>}
            {activeSession && !startError && (
              <Alert tone="warning" role="status" className="mt-4">
                You have an interview in progress. Starting a new one replaces it.
              </Alert>
            )}
          </Card>
        </aside>
      </form>

      <Modal
        open={confirm.isOpen('replace')}
        onClose={confirm.close}
        title="Replace your current interview?"
        description="Your interview in progress and its answers will be discarded."
        actions={
          <>
            <Button variant="secondary" to={activeSession ? `/interview/${activeSession.id}` : '/'}>
              Resume current interview
            </Button>
            <Button variant="danger" onClick={begin}>
              Start new interview
            </Button>
          </>
        }
      />
    </>
  )
}
