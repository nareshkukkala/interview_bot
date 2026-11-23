import { cn } from '../../utils/format.js'
import Card from '../ui/Card.jsx'

/** A titled list of takeaways (strengths, improvement areas, learning recommendations). */
export default function InsightCard({ id, title, description, icon: Icon, iconClass, items, children, className }) {
  return (
    <Card as="section" aria-labelledby={id} className={className}>
      <h2 id={id} className="text-base font-semibold text-white">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm leading-relaxed [overflow-wrap:anywhere] text-[#cbd5e1]">
            <Icon className={cn('mt-0.5 size-4 shrink-0', iconClass)} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
      {children}
    </Card>
  )
}
