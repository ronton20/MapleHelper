import { useState } from 'react'
import { Check, Coffee, Copy, MessageCircle } from 'lucide-react'
import { BUY_ME_A_COFFEE, SOCIALS } from '../config'

/** Contact + support links at the bottom of the sidebar (desktop and the mobile drawer) */
export function SidebarFooter() {
  const [copied, setCopied] = useState(false)
  async function copyDiscord() {
    try { await navigator.clipboard.writeText(SOCIALS.discord); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
  }
  if (!SOCIALS.discord && !BUY_ME_A_COFFEE) return null
  return (
    <div data-tour="sidebar-footer" className="space-y-2 border-t border-line px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {SOCIALS.discord && (
        <div>
          <div className="label mb-1 px-1">Bugs &amp; ideas</div>
          <button onClick={copyDiscord} title="Copy Discord username"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:bg-panel-2 hover:text-text">
            <MessageCircle size={14} className="shrink-0 text-[#5865F2]" />
            <span className="flex-1 truncate text-left">Discord: <span className="text-text">{SOCIALS.discord}</span></span>
            {copied ? <span className="flex items-center gap-1 text-accent"><Check size={12} />Copied</span> : <Copy size={12} className="shrink-0" />}
          </button>
        </div>
      )}
      {BUY_ME_A_COFFEE && (
        <a href={`https://buymeacoffee.com/${BUY_ME_A_COFFEE}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-md bg-[#FFDD00] px-3 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90">
          <Coffee size={14} />Buy me a coffee
        </a>
      )}
    </div>
  )
}
