import { motion } from "framer-motion";
import { Wordmark } from "@/components/app-shell";

export function Splash() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[100] grid place-items-center bg-background"
    >
      <div className="flex flex-col items-center gap-3">
        <motion.div
          initial={{ y: 20, opacity: 0, filter: "blur(8px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl sm:text-6xl"
          style={{
            textShadow:
              "0 0 40px color-mix(in oklch, var(--sand) 50%, transparent), 0 0 80px color-mix(in oklch, var(--sand) 25%, transparent)",
          }}
        >
          <Wordmark className="text-5xl sm:text-6xl" />
        </motion.div>
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.7 }}
          className="text-sm text-muted-foreground"
        >
          Be seen. Be Preznt.
        </motion.div>
      </div>

      <div className="absolute bottom-12 left-1/2 h-[2px] w-44 -translate-x-1/2 overflow-hidden rounded-full bg-card">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: 1.8, ease: "easeInOut" }}
          className="h-full bg-gradient-to-r from-sand to-sage"
        />
      </div>
    </motion.div>
  );
}
