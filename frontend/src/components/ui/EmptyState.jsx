import { cn } from '../../utils/format.js'

export default function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon && (
        <span className="mb-4 grid size-12 place-items-center rounded-xl border border-line bg-surface text-muted">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {description && <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
