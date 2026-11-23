import { useCallback, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import Button from '../components/ui/Button.jsx'
import Card, { CardHeader } from '../components/ui/Card.jsx'
import { ChoiceField, SelectField, TextField, Toggle } from '../components/ui/FormControls.jsx'
import Modal from '../components/ui/Modal.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { useApp } from '../context/useApp.js'
import { DIFFICULTIES, EXPERIENCE_LEVELS, INTERVIEW_TYPES, ROLES } from '../constants/options.js'
import { isValidName } from '../utils/validation.js'

export default function SettingsPage() {
  const { settings, updateSettings, completedCount, clearCompleted } = useApp()
  const [form, setForm] = useState(settings)
  const [nameError, setNameError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const update = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setSaved(false)
  }

  const onSubmit = (event) => {
    event.preventDefault()
    const name = form.candidateName.trim()
    if (name && !isValidName(name)) {
      setNameError('Enter a name of 2–50 letters, or leave it empty.')
      return
    }
    setNameError(null)
    updateSettings({ ...form, candidateName: name })
    setSaved(true)
  }

  const closeClear = useCallback(() => setConfirmClear(false), [])

  return (
    <>
      <PageHeader title="Settings" description="Defaults for new interviews and how the app behaves. Settings last until this tab is closed or refreshed." />

      <form onSubmit={onSubmit} noValidate className="max-w-3xl space-y-6">
        <Card>
          <CardHeader title="Profile" description="Used to personalise your dashboard and reports." />
          <TextField
            id="settings-name"
            label="Your name"
            placeholder="e.g. Priya Sharma"
            maxLength={50}
            value={form.candidateName}
            onChange={(e) => update('candidateName', e.target.value)}
            error={nameError}
          />
        </Card>

        <Card className="space-y-7">
          <CardHeader title="Interview defaults" description="Pre-filled when you set up a new interview." className="mb-0" />
          <div className="grid gap-7 sm:grid-cols-2">
            <SelectField
              id="settings-role"
              label="Job role"
              options={ROLES}
              value={form.jobRole}
              onChange={(e) => update('jobRole', e.target.value)}
            />
            <SelectField
              id="settings-experience"
              label="Experience"
              options={EXPERIENCE_LEVELS}
              value={form.experience}
              onChange={(e) => update('experience', e.target.value)}
            />
          </div>
          <ChoiceField
            id="settings-difficulty"
            label="Difficulty"
            options={DIFFICULTIES}
            value={form.difficulty}
            onChange={(v) => update('difficulty', v)}
          />
          <ChoiceField
            id="settings-type"
            label="Interview type"
            options={INTERVIEW_TYPES}
            value={form.interviewType}
            onChange={(v) => update('interviewType', v)}
          />
        </Card>

        <Card className="space-y-6">
          <CardHeader title="Preferences" className="mb-0" />
          <Toggle
            id="settings-timer"
            label="Show question timer"
            description="Displays how long you have spent on the current question."
            checked={form.showTimer}
            onChange={(v) => update('showTimer', v)}
          />
          <div className="border-t border-line pt-6">
            <Toggle
              id="settings-sample"
              label="Show example interviews"
              description="Adds clearly labelled demo interviews so you can preview the dashboard. They are not your results, and your real results never include them."
              checked={form.showSampleData}
              onChange={(v) => update('showSampleData', v)}
            />
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit">Save settings</Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-success" role="status">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Settings saved
            </span>
          )}
        </div>
      </form>

      <Card className="mt-10 max-w-3xl border-danger/25">
        <CardHeader
          title="Clear your interviews"
          description={`Removes the ${completedCount} interview${completedCount === 1 ? '' : 's'} you completed in this tab. Sample interviews are not affected.`}
          className="mb-4"
        />
        <Button variant="secondary" onClick={() => setConfirmClear(true)} disabled={completedCount === 0}>
          Clear interviews
        </Button>
      </Card>

      <Modal
        open={confirmClear}
        onClose={closeClear}
        title="Clear your interviews?"
        description="Their reports will be removed and cannot be recovered."
        actions={
          <>
            <Button variant="secondary" onClick={closeClear}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                clearCompleted()
                closeClear()
              }}
            >
              Clear interviews
            </Button>
          </>
        }
      />
    </>
  )
}
