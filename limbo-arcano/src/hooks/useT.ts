import { useCallback } from 'react'
import { translate, type TranslationKey } from '@/i18n'
import { useGame } from '@/store/useGame'

export type Translator = (key: TranslationKey, vars?: Record<string, string | number>) => string

export function useT(): Translator {
  const lang = useGame((state) => state.settings.lang)
  return useCallback((key, vars) => translate(lang, key, vars), [lang])
}
