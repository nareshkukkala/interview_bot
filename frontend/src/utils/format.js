export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

/** Score tone on a 0–100 scale, aligned with PRD BR-08 label bands. */
export function scoreTone(percent) {
  if (percent >= 80) return 'success'
  if (percent >= 60) return 'accent'
  if (percent >= 40) return 'warning'
  return 'danger'
}

export const TONE_COLOR = {
  success: 'var(--color-success)',
  accent: 'var(--color-accent)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  primary: 'var(--color-primary)',
}

export const TONE_TEXT = {
  success: 'text-success',
  accent: 'text-accent',
  warning: 'text-warning',
  danger: 'text-danger',
  primary: 'text-primary',
}

/** 125 → "2:05" */
export function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** 4510 → "1h 15m", 750 → "12m 30s", 42 → "42s" */
export function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
  return `${seconds}s`
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const shortDateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatDate(timestamp) {
  return dateFormatter.format(timestamp)
}

export function formatShortDate(timestamp) {
  return shortDateFormatter.format(timestamp)
}

export function formatRelative(timestamp) {
  const diffSeconds = Math.round((timestamp - Date.now()) / 1000)
  const abs = Math.abs(diffSeconds)
  if (abs < 60) return 'Just now'
  if (abs < 3600) return relativeFormatter.format(Math.round(diffSeconds / 60), 'minute')
  if (abs < 86400) return relativeFormatter.format(Math.round(diffSeconds / 3600), 'hour')
  if (abs < 86400 * 30) return relativeFormatter.format(Math.round(diffSeconds / 86400), 'day')
  return formatDate(timestamp)
}

export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase()
}
