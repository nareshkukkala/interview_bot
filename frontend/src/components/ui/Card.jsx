import { cn } from '../../utils/format.js'

export default function Card({ as: Tag = 'div', padded = true, className, children, ...props }) {
  return (
    <Tag
      className={cn('rounded-xl border border-line bg-card shadow-sm shadow-black/20', padded && 'p-5 sm:p-6', className)}
      {...props}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cn('mb-5 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
