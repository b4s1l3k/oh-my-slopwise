"use client"
import { useState, useRef, useEffect } from "react"
import * as Popover from "@radix-ui/react-popover"
import { ChevronDown, Search } from "lucide-react"
import { SUPPORTED_CURRENCIES, CURRENCY_META, type SupportedCurrency } from "@/lib/currencies"
import { cn } from "@/lib/utils"

type Props = {
  value: string
  onChange: (value: string) => void
  recentCurrencies?: string[]
  className?: string
  triggerClassName?: string
}

export function CurrencySelect({ value, onChange, recentCurrencies = [], className, triggerClassName }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else setSearch("")
  }, [open])

  const query = search.toLowerCase()
  const filtered = SUPPORTED_CURRENCIES.filter((code) => {
    if (!query) return true
    const meta = CURRENCY_META[code]
    return (
      code.toLowerCase().includes(query) ||
      meta.label.toLowerCase().includes(query) ||
      meta.symbol.toLowerCase().includes(query)
    )
  })

  const recent = recentCurrencies.filter(
    (c): c is SupportedCurrency => c in CURRENCY_META && c !== value && !query
  )
  const rest = filtered.filter((c) => !recent.includes(c))

  const current = value in CURRENCY_META ? CURRENCY_META[value as SupportedCurrency] : null

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            triggerClassName
          )}
        >
          <span className="font-medium">{current ? `${current.symbol} ${value}` : value}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className={cn(
            "z-[200] w-64 overflow-hidden rounded-md border bg-popover shadow-md outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            className
          )}
          align="start"
          sideOffset={4}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div className="flex items-center border-b px-3 py-2 gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск валюты..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {recent.length > 0 && (
              <>
                <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Недавние
                </p>
                {recent.map((code) => (
                  <CurrencyItem key={code} code={code} selected={code === value} onSelect={(c) => { onChange(c); setOpen(false) }} />
                ))}
                <div className="mx-3 my-1 border-t" />
              </>
            )}

            {rest.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">Не найдено</p>
            ) : (
              rest.map((code) => (
                <CurrencyItem key={code} code={code} selected={code === value} onSelect={(c) => { onChange(c); setOpen(false) }} />
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function CurrencyItem({ code, selected, onSelect }: { code: SupportedCurrency; selected: boolean; onSelect: (c: string) => void }) {
  const meta = CURRENCY_META[code]
  return (
    <button
      type="button"
      onClick={() => onSelect(code)}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-1.5 text-sm transition-colors hover:bg-accent",
        selected && "bg-accent font-medium"
      )}
    >
      <span className="w-6 text-center text-muted-foreground">{meta.symbol}</span>
      <span className="font-medium">{code}</span>
      <span className="text-muted-foreground truncate">{meta.label}</span>
    </button>
  )
}
