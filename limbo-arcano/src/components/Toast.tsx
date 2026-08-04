import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { Icon } from './ui/Icon'
import { useT } from '@/hooks/useT'
import { useGame } from '@/store/useGame'
import type { TranslationKey } from '@/i18n'

/** Avisos efimeros: el store guarda la clave y aqui se traduce y se caduca. */
export function Toast() {
  const t = useT()
  const notice = useGame((state) => state.notice)
  const dismiss = useGame((state) => state.dismissNotice)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(dismiss, 3600)
    return () => clearTimeout(timer)
  }, [notice, dismiss])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-60 flex justify-center px-4">
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.id}
            initial={{ opacity: 0, y: 22, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className={`glass pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13px] font-medium ${
              notice.tone === 'warn' ? 'text-rose-300' : 'text-jade-300'
            }`}
          >
            <Icon name={notice.tone === 'warn' ? 'warning' : 'check'} className="size-4" />
            {t(notice.text as TranslationKey)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
