import { Component } from 'react'
import { LogoMark } from './ui/Logo.jsx'

/**
 * Last line of defence: if any screen throws while rendering, show a message and a way out instead of a blank page.
 * (Bad API responses are already turned into friendly errors before they reach a screen; this covers anything else.)
 */
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    // The message only: no component state, answers or other user content is logged
    console.error('InterviewIQ screen error:', error?.message)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="grid min-h-screen place-items-center bg-base px-4 text-center">
        <div className="max-w-md">
          <LogoMark className="mx-auto size-10" />
          <h1 className="mt-6 text-xl font-semibold text-white">Something went wrong on this screen</h1>
          <p className="mt-2 text-sm text-muted">
            The page could not be displayed. Your interview data is kept by the server, but progress shown in this tab may be lost when you reload.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-card px-4 text-sm font-medium text-white hover:border-line-strong"
            >
              Reload the page
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Go to the dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }
}
