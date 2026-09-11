import { Reveal } from "@/components/motion/reveal"
import { DEFAULT_LOCALE, getDictionary } from "@/lib/i18n"

/** 实验室说明：Hero 与展板之后的第二幕，三条编号原则。 */
export function LabStatement() {
  const t = getDictionary(DEFAULT_LOCALE)

  return (
    <section
      id="about"
      aria-labelledby="about-title"
      className="scroll-mt-20 border-t border-hairline bg-paper-raised"
    >
      <div className="mx-auto w-full max-w-shell px-6 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <p className="label-micro text-vermilion">{t.about.index}</p>
            <h2 id="about-title" className="mt-4 text-headline text-ink">
              {t.about.title}
            </h2>
            <p className="mt-5 max-w-md text-lede text-pretty text-ink-soft">
              {t.about.description}
            </p>
          </Reveal>

          <Reveal className="lg:col-span-7" delay={0.08}>
            <ol>
              {t.about.points.map((point, index) => (
                <li
                  key={point.index}
                  className={
                    index === 0
                      ? "grid gap-2 sm:grid-cols-[3rem_1fr] sm:gap-6"
                      : "mt-8 grid gap-2 border-t border-hairline pt-8 sm:grid-cols-[3rem_1fr] sm:gap-6"
                  }
                >
                  <span
                    aria-hidden
                    className="font-mono text-[0.6875rem] tracking-[0.16em] text-ink-faint sm:pt-1.5"
                  >
                    {point.index}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-ink">
                      {point.title}
                    </h3>
                    <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-soft">
                      {point.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
