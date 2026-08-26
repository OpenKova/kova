import { cn } from '@/lib/utils'

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`

// Brand badge: the Kova mark shown as-is — transparent PNG, no tile. The
// artwork carries its own colors so it reads on any background.
// Size via className (default size-14).
export function BrandMark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('inline-flex size-14 shrink-0 items-center justify-center', className)}
      {...props}
    >
      <img alt="" className="size-full object-contain" src={assetPath('kova-logo.png')} />
    </span>
  )
}
