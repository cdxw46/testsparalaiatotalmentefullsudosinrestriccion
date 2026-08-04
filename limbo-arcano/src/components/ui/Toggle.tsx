interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  id?: string
}

export function Toggle({ checked, onChange, label, id }: ToggleProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ${
        checked
          ? 'border-jade-500/60 bg-jade-600/80 shadow-[0_0_14px_-2px_var(--color-jade-500)]'
          : 'border-white/10 bg-black/50'
      }`}
    >
      <span
        className={`absolute top-0.5 size-4.5 rounded-full bg-white shadow transition-all duration-200 ${
          checked ? 'left-[1.55rem]' : 'left-0.5 bg-abyss-300'
        }`}
      />
    </button>
  )
}
