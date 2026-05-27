import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

const words = [
  "aksiyona",
  "içgörüye",
  "büyümeye",
];

export const AnimatedHeadline = () => {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(() => words, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setTitleNumber((current) => (current === titles.length - 1 ? 0 : current + 1));
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  return (
    <h1 className="mx-auto mb-6 max-w-5xl text-center text-4xl font-bold leading-[1.16] tracking-normal text-text-primary sm:text-5xl lg:text-6xl">
      <span>Araştırmayı </span>
      <span
        className="relative inline-grid min-w-[10ch] overflow-hidden align-baseline text-brand-primary"
        aria-live="polite"
      >
        <span className="invisible col-start-1 row-start-1 whitespace-nowrap px-1 py-1 leading-[1.16]">
          büyümeye
        </span>
        {titles.map((title, index) => (
          <motion.span
            key={title}
            className="absolute inset-x-0 top-0 whitespace-nowrap px-1 py-1 text-center font-bold leading-[1.16]"
            initial={{ opacity: 0, y: "-120%" }}
            transition={{ type: "spring", stiffness: 50, damping: 16 }}
            animate={
              titleNumber === index
                ? {
                    y: 0,
                    opacity: 1,
                  }
                : {
                    y: titleNumber > index ? "-160%" : "160%",
                    opacity: 0,
                  }
            }
          >
            {title}
          </motion.span>
        ))}
      </span>
      <span> dönüştürün.</span>
    </h1>
  );
};
