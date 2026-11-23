import { Sparkles } from 'lucide-react'
import Card from '../ui/Card.jsx'

/** A placeholder in the shape of the feedback, shown while Gemini scores the answer. Decorative: the editor announces the status. */
export default function FeedbackSkeleton() {
  return (
    <Card as="section" aria-hidden="true" className="sm:p-8">
      <p className="mb-6 flex items-center gap-2 text-sm font-medium text-accent">
        <Sparkles className="size-4 animate-pulse" />
        Gemini is reviewing your answer…
      </p>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="skeleton size-24 shrink-0 rounded-full" />
        <div className="grid flex-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="skeleton h-3 w-2/3" />
              <div className="skeleton mt-3 h-1.5 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 grid gap-6 border-t border-line pt-6 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-5/6" />
            <div className="skeleton h-3 w-2/3" />
          </div>
        ))}
      </div>
    </Card>
  )
}
