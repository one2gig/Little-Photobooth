import { motion, useReducedMotion } from 'framer-motion'

export function Countdown({ value }: { value: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      key={value}
      initial={reduce ? false : { scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="font-display text-[8.5rem] leading-none text-strawberry"
      aria-live="assertive"
    >
      {value === 0 ? '♥' : value}
    </motion.div>
  )
}
