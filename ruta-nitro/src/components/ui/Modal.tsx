import { AnimatePresence, motion } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useT } from '@/hooks/useT'

interface ModalProps {
  open: boolean
  title: string
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

export function Modal({ open, title, icon, onClose, children, wide }: ModalProps) {
  const t = useT()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label={t('common.close')}
            className="fixed inset-0 cursor-default bg-black/78 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`glass relative my-auto w-full overflow-hidden rounded-2xl ${wide ? 'max-w-4xl' : 'max-w-lg'}`}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <header className="flex items-center gap-3 border-b border-white/8 bg-white/2 px-5 py-4">
              {icon && <span className="text-nitro-400">{icon}</span>}
              <h2 className="font-display flex-1 text-lg tracking-wide text-white">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
                className="btn-ghost grid size-9 place-items-center rounded-lg"
              >
                <Icon name="close" className="size-4.5" />
              </button>
            </header>

            <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto px-5 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
