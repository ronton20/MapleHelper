import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp, Crosshair, PlayCircle, X } from 'lucide-react'
import { useIsMobile } from '../store'
import { GUIDES, TOUR_ORDER, type GuideStep } from './guides'
import { useTutorial, findTarget } from './store'

/** "?" button for the top right of a page / dialog: opens that page's guide */
export function HelpButton({ guide, className = '' }: { guide: string; className?: string }) {
  const open = useTutorial(s => s.openHelp)
  return (
    <button className={`btn btn-ghost btn-sm ${className}`} title="Help for this page" aria-label="Help" onClick={() => open(guide)}>
      <CircleHelp size={15} />
    </button>
  )
}

/** guided tour overlay + help panel; mount once at the app root */
export function Tutorial() {
  return createPortal(<><TourRunner /><HelpPanel /></>, document.body)
}

// ---------------------------------------------------------------------------------------------------------------
/** **bold** and line breaks */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') && p.endsWith('**') ? <b key={i} className="font-semibold text-text">{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>)}</>
}
const textOf = (s: GuideStep, mobile: boolean) => typeof s.text === 'function' ? s.text(mobile) : s.text
const forDevice = (s: GuideStep, mobile: boolean) => !s.when || (s.when === 'mobile') === mobile

function TourRunner() {
  const t = useTutorial()
  const mobile = useIsMobile()

  // start the next waiting tour (after a beat, so the page has rendered)
  useEffect(() => {
    if (t.skipped || t.help) return
    // a page's tour waits until no dialog is open; a dialog's own tour runs inside it
    const ready = (id: string, modals: number, paused: boolean) => GUIDES[id]?.dialog ? true : modals === 0 && !paused
    const waitingDialogTour = () => TOUR_ORDER.find(id => GUIDES[id]?.dialog && t.registered.includes(id) && !t.seen.includes(id))
    if (t.active) {
      // a page tour is running and a dialog with its own tour opened → put the page tour aside, run the dialog's
      if (!GUIDES[t.active.id]?.dialog && !t.active.single && t.modals > 0 && waitingDialogTour()) t.suspend()
      return
    }
    if (t.paused && t.modals === 0) { t.resume(); return }
    const id = TOUR_ORDER.find(id => t.registered.includes(id) && !t.seen.includes(id) && ready(id, t.modals, !!t.paused))
    if (!id) return
    const timer = window.setTimeout(() => {
      const s = useTutorial.getState()
      if (!s.active && !s.help && !s.skipped && s.registered.includes(id) && !s.seen.includes(id) && ready(id, s.modals, !!s.paused)) s.start(id)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [t.skipped, t.active, t.paused, t.help, t.registered, t.seen, t.modals])  // eslint-disable-line react-hooks/exhaustive-deps

  // the page / dialog of the running tour went away (e.g. the user's action closed it) → that tour is done
  useEffect(() => {
    if (t.active && !t.active.single && !t.registered.includes(t.active.id)) t.finish(true)
  }, [t.active, t.registered])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!t.active) return null
  const guide = GUIDES[t.active.id]
  if (!guide) return null
  // a page tour pauses while a dialog is open (e.g. ✏️ opened Edit character) and resumes at the same step after
  if (!guide.dialog && t.modals > 0) return null
  const single = t.active.single
  const steps = single ? [single] : guide.steps.filter(s => !s.helpOnly && forDevice(s, mobile))
  const i = t.active.step
  const step = steps[i]
  if (!step) return null
  const next = () => { if (i + 1 >= steps.length) t.finish(!single); else t.go(i + 1, 1) }
  const back = () => { if (i > 0) t.go(i - 1, -1) }
  const missing = () => { if (t.active!.dir === -1 && i > 0) back(); else next() }
  return <Spotlight key={`${t.active.id}:${i}:${single ? 's' : ''}`} step={step} guideTitle={guide.title} index={i} total={steps.length} single={!!single} mobile={mobile}
    onNext={next} onBack={back} onMissing={missing} onSkip={() => single ? t.finish(false) : t.skipAll()} />
}

function defaultMode(el: HTMLElement): 'click' | 'change' | 'none' {
  if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') return 'click'
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return 'change'
  return 'none'
}

const PAD = 6
const SHADE = 'rgba(5, 6, 9, 0.72)'

function Spotlight({ step, guideTitle, index, total, single, mobile, onNext, onBack, onMissing, onSkip }: {
  step: GuideStep; guideTitle: string; index: number; total: number; single: boolean; mobile: boolean
  onNext: () => void; onBack: () => void; onMissing: () => void; onSkip: () => void
}) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  const cb = useRef({ onNext, onMissing }); cb.current = { onNext, onMissing }

  // find the target (it may take a moment to appear), bring it into view
  useEffect(() => {
    if (step.event) window.dispatchEvent(new CustomEvent('tutorial', { detail: step.event }))
    if (!step.target) return
    const t0 = performance.now(); let raf = 0
    const look = () => {
      const e = findTarget(step.target!)
      if (e) {
        const r = e.getBoundingClientRect()
        if (r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth) e.scrollIntoView({ block: r.height > window.innerHeight * 0.7 ? 'start' : 'center', inline: 'nearest' })
        setEl(e); return
      }
      if (performance.now() - t0 > 700) { cb.current.onMissing(); return }
      raf = requestAnimationFrame(look)
    }
    look()
    return () => cancelAnimationFrame(raf)
  }, [step])

  // follow the target every frame (scrolling, animations, layout changes); if it disappears, move on
  useEffect(() => {
    if (!el) return
    let raf = 0, last = '', goneSince = 0
    const tick = () => {
      if (!el.isConnected || el.getBoundingClientRect().width === 0) {
        const again = step.target ? findTarget(step.target) : null
        if (again) { setEl(again); return }
        if (!goneSince) goneSince = performance.now()
        else if (performance.now() - goneSince > 500) { cb.current.onNext(); return }
        raf = requestAnimationFrame(tick); return
      }
      goneSince = 0
      const r = el.getBoundingClientRect()
      const key = `${r.left}|${r.top}|${r.width}|${r.height}|${window.innerWidth}|${window.innerHeight}`
      if (key !== last) {
        last = key
        setRect({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 })
        setVp({ w: window.innerWidth, h: window.innerHeight })
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [el, step.target])

  // using the highlighted element counts as "got it"
  const mode = step.advanceOn ?? (el ? defaultMode(el) : 'none')
  useEffect(() => {
    if (!el || mode === 'none') return
    let done = false
    const h = () => { if (done) return; done = true; window.setTimeout(() => cb.current.onNext(), mode === 'click' ? 150 : 0) }
    el.addEventListener(mode, h)
    return () => el.removeEventListener(mode, h)
  }, [el, mode])

  const waiting = !!step.target && !rect
  const blocker = 'fixed pointer-events-auto'
  return (
    <div data-tutorial-ui className="pointer-events-none fixed inset-0 z-[1000]">
      {rect ? (
        <>
          {/* the hole: darkens everything around the target, which stays clickable */}
          <div className="tut-spot fixed rounded-lg transition-all duration-200 ease-out" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
          {/* click blockers around the hole */}
          <div className={blocker} style={{ left: 0, top: 0, width: vp.w, height: Math.max(0, rect.y) }} />
          <div className={blocker} style={{ left: 0, top: rect.y + rect.h, width: vp.w, height: Math.max(0, vp.h - rect.y - rect.h) }} />
          <div className={blocker} style={{ left: 0, top: rect.y, width: Math.max(0, rect.x), height: rect.h }} />
          <div className={blocker} style={{ left: rect.x + rect.w, top: rect.y, width: Math.max(0, vp.w - rect.x - rect.w), height: rect.h }} />
        </>
      ) : <div className={`${blocker} inset-0`} style={{ background: SHADE }} />}
      {!waiting && (
        <Bubble rect={rect} vp={vp} mobile={mobile}>
          <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-accent">
            <span>{guideTitle}{total > 1 ? ` · ${index + 1}/${total}` : ''}</span>
            {single && <button className="text-muted hover:text-text" onClick={onSkip} aria-label="Close"><X size={13} /></button>}
          </div>
          <div className="mb-1 text-sm font-semibold">{step.title}</div>
          <div className="whitespace-pre-line text-xs leading-relaxed text-muted"><Rich text={textOf(step, mobile)} /></div>
          {step.tourNote && !single && <div className="mt-2 whitespace-pre-line text-xs leading-relaxed text-text/90"><Rich text={step.tourNote} /></div>}
          {rect && mode !== 'none' && !single && !step.tourNote && <div className="mt-2 text-[11px] text-accent/80">Try it: using the highlighted {mode === 'click' ? 'button' : 'field'} continues the guide.</div>}
          <div className="mt-3 flex items-center gap-2">
            {!single && <button className="text-[11px] text-muted underline-offset-2 hover:text-text hover:underline" onClick={onSkip}>Skip tutorial</button>}
            <div className="ml-auto flex gap-1.5">
              {index > 0 && !single && <button className="btn btn-sm" onClick={onBack}>Back</button>}
              <button className="btn btn-sm btn-primary" autoFocus onClick={onNext}>{step.nextLabel ?? (single || index === total - 1 ? 'Got it' : 'Got it →')}</button>
            </div>
          </div>
        </Bubble>
      )}
    </div>
  )
}

/** speech bubble placed next to the target (below, above, right or left – whichever fits), with a pointer */
function Bubble({ rect, vp, mobile, children }: { rect: { x: number; y: number; w: number; h: number } | null; vp: { w: number; h: number }; mobile: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [bh, setBh] = useState(160)
  useLayoutEffect(() => { if (ref.current) setBh(ref.current.offsetHeight) })
  const bw = Math.min(mobile ? 340 : 360, vp.w - 16)
  const GAP = 12, M = 8
  let left: number, top: number, side: 'top' | 'bottom' | 'left' | 'right' | null = null, arrow = 0
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
  if (!rect) { left = (vp.w - bw) / 2; top = (vp.h - bh) / 2 }
  else {
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2
    if (rect.y + rect.h + GAP + bh <= vp.h - M) { side = 'top'; top = rect.y + rect.h + GAP; left = clamp(cx - bw / 2, M, vp.w - bw - M); arrow = clamp(cx - left, 16, bw - 16) }
    else if (rect.y - GAP - bh >= M) { side = 'bottom'; top = rect.y - GAP - bh; left = clamp(cx - bw / 2, M, vp.w - bw - M); arrow = clamp(cx - left, 16, bw - 16) }
    else if (rect.x + rect.w + GAP + bw <= vp.w - M) { side = 'left'; left = rect.x + rect.w + GAP; top = clamp(cy - bh / 2, M, vp.h - bh - M); arrow = clamp(cy - top, 16, bh - 16) }
    else if (rect.x - GAP - bw >= M) { side = 'right'; left = rect.x - GAP - bw; top = clamp(cy - bh / 2, M, vp.h - bh - M); arrow = clamp(cy - top, 16, bh - 16) }
    else { left = (vp.w - bw) / 2; top = vp.h - bh - M - (mobile ? 56 : 16) }   // target fills the screen: float at the bottom
  }
  const arrowStyle: React.CSSProperties | null = side === 'top' ? { top: -6, left: arrow - 6, borderRightWidth: 0, borderBottomWidth: 0 }
    : side === 'bottom' ? { bottom: -6, left: arrow - 6, borderLeftWidth: 0, borderTopWidth: 0 }
    : side === 'left' ? { left: -6, top: arrow - 6, borderTopWidth: 0, borderRightWidth: 0 }
    : side === 'right' ? { right: -6, top: arrow - 6, borderBottomWidth: 0, borderLeftWidth: 0 } : null
  return (
    <div ref={ref} className="tut-bubble pointer-events-auto fixed rounded-xl border border-accent/50 bg-panel p-3.5 shadow-2xl shadow-black/60 transition-[left,top] duration-200 ease-out" style={{ left, top, width: bw }}>
      {arrowStyle && <span className="absolute h-3 w-3 rotate-45 border border-accent/50 bg-panel" style={arrowStyle} />}
      <div className="relative">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
/** the "?" panel: the page's guide, each part with a live picture of that part of the page and a "Show me" */
function HelpPanel() {
  const { help, openHelp, start } = useTutorial()
  const mobile = useIsMobile()
  const [, force] = useState(0)
  useEffect(() => {
    if (!help) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') openHelp(null) }
    window.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => force(n => n + 1), 50)   // re-check which parts are on screen
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(t) }
  }, [help, openHelp])
  if (!help) return null
  const guide = GUIDES[help]
  if (!guide) return null
  const parts = guide.steps.filter(s => !s.tourOnly && forDevice(s, mobile))
  return (
    <div data-tutorial-ui className="fixed inset-0 z-[900] flex justify-end bg-black/50" onMouseDown={() => openHelp(null)}>
      <div className="tut-panel flex h-full w-[400px] max-w-full flex-col border-l border-line bg-panel shadow-2xl" onMouseDown={e => e.stopPropagation()}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <CircleHelp size={16} className="text-accent" />
          <span className="flex-1 text-sm font-semibold">{guide.title}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => openHelp(null)} aria-label="Close"><X size={14} /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {parts.map((s, i) => {
            const onScreen = s.target ? !!findTarget(s.target) : false
            return (
              <section key={i}>
                {s.target && onScreen && <Snapshot target={s.target} />}
                <div className="mt-2 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{s.title}</div>
                    <div className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-muted"><Rich text={textOf(s, mobile)} /></div>
                  </div>
                  {(onScreen || (s.target && s.event)) && <button className="btn btn-sm shrink-0" title="Highlight it on the page" onClick={() => start(help, s)}><Crosshair size={12} />Show me</button>}
                </div>
              </section>
            )
          })}
        </div>
        {guide.tour && (
          <div className="border-t border-line p-3">
            <button className="btn w-full justify-center" onClick={() => start(help)}><PlayCircle size={14} />Replay the guided tour</button>
          </div>
        )}
      </div>
    </div>
  )
}

/** a scaled-down, non-interactive copy of the element as it looks right now */
function Snapshot({ target }: { target: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number; s: number } | null>(null)
  useLayoutEffect(() => {
    const src = findTarget(target), host = box.current
    if (!src || !host) return
    const r = src.getBoundingClientRect()
    const maxW = host.parentElement!.clientWidth, maxH = 230
    const s = Math.min(1, maxW / r.width, maxH / r.height)
    const copy = src.cloneNode(true) as HTMLElement
    // carry over what cloneNode drops: current values of inputs / selects / checkboxes
    const from = src.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')
    const to = copy.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')
    from.forEach((f, i) => { const c = to[i]; if (!c) return; if (c instanceof HTMLInputElement && (c.type === 'checkbox' || c.type === 'radio')) c.checked = (f as HTMLInputElement).checked; else c.value = f.value })
    for (const n of [copy, ...copy.querySelectorAll<HTMLElement>('[data-tour], [data-nav], [id], [autofocus]')]) { n.removeAttribute('data-tour'); n.removeAttribute('data-nav'); n.removeAttribute('id'); n.removeAttribute('autofocus') }
    Object.assign(copy.style, { position: 'relative', inset: 'auto', left: '0', top: '0', margin: '0', transform: 'none', width: `${r.width}px`, height: `${r.height}px`, maxHeight: 'none', maxWidth: 'none', overflow: 'hidden' })
    host.replaceChildren(copy)
    setSize({ w: r.width, h: r.height, s })
  }, [target])
  return (
    <div className="overflow-hidden rounded-lg border border-line-2 bg-bg" style={size ? { width: size.w * size.s, height: size.h * size.s } : { height: 0 }}>
      <div ref={box} inert aria-hidden className="pointer-events-none origin-top-left select-none" style={size ? { width: size.w, height: size.h, transform: `scale(${size.s})` } : undefined} />
    </div>
  )
}
