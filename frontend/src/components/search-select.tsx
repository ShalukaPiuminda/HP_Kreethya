'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, Plus, Search, X } from 'lucide-react';
import { usePopupKeyboard } from '@/lib/use-popup-keyboard';

export type SearchSelectOption = {
  value: string;
  label: string;
  /** Secondary text shown under the label (NIC, code, balance...). Also searchable. */
  description?: string | null;
  /** Extra hidden text to match against when searching. */
  keywords?: string | null;
  disabled?: boolean;
};

const PAGE_SIZES = [10, 25, 50];

const defaultTriggerClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100';

/**
 * Master-data picker (customers, items, suppliers, stores...).
 * Drop-in for a native `<select>`: the field opens a popup window with its own search bar and a
 * paginated list, and reports the chosen value back through `onChange`.
 */
export function SearchSelect({
  value,
  onChange,
  options,
  title,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyOption,
  noResultsText = 'No matches found',
  required = false,
  disabled = false,
  className = defaultTriggerClass,
  wrapperClassName = '',
  name,
  id,
  createAction,
}: {
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  /** Heading of the popup window. Defaults to the placeholder. */
  title?: string;
  /** Shown on the field when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  /** Adds a selectable blank entry at the top (e.g. "All stores", "No salesperson"). */
  emptyOption?: string;
  noResultsText?: string;
  required?: boolean;
  disabled?: boolean;
  /** Classes for the field; pass the page's input class so it matches surrounding fields. */
  className?: string;
  /** Classes for the outer wrapper, e.g. `flex-1` when placed in a flex row. */
  wrapperClassName?: string;
  name?: string;
  id?: string;
  /**
   * Adds a "create new" button under the list (e.g. "Add new item"). It is highlighted when the
   * search finds nothing; clicking it closes the popup and passes on the search text.
   */
  createAction?: { label: string; onCreate: (query: string) => void };
}) {
  const current = value == null ? '' : String(value);
  const dialogTitleId = useId();
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [active, setActive] = useState(0);

  const allOptions = useMemo<SearchSelectOption[]>(
    () => (emptyOption !== undefined ? [{ value: '', label: emptyOption }, ...options] : options),
    [emptyOption, options],
  );
  const selected = allOptions.find((option) => option.value === current);

  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return allOptions;
    return allOptions.filter((option) => {
      const haystack = `${option.label} ${option.description ?? ''} ${option.keywords ?? ''} ${option.value}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [allOptions, query]);

  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const rows = matches.slice(start, start + pageSize);

  function openPopup(initialQuery = '') {
    if (disabled) return;
    setQuery(initialQuery);
    // Start on the page holding the current selection so it is visible straight away.
    const index = initialQuery ? -1 : allOptions.findIndex((option) => option.value === current);
    setPage(index >= 0 ? Math.floor(index / pageSize) + 1 : 1);
    setActive(index >= 0 ? index % pageSize : 0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  }

  function choose(option: SearchSelectOption | undefined) {
    if (!option || option.disabled) return;
    if (option.value !== current) onChange(option.value);
    close();
  }

  function create() {
    if (!createAction) return;
    const text = query.trim();
    close();
    createAction.onCreate(text);
  }

  function goToPage(next: number) {
    setPage(Math.min(Math.max(1, next), pageCount));
    setActive(0);
  }

  // Esc closes, Tab stays inside the popup, focus goes back to the field afterwards.
  usePopupKeyboard(dialogRef, close, open);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function move(step: number) {
    if (!rows.length) return;
    let next = active;
    for (let i = 0; i < rows.length; i += 1) {
      next = (next + step + rows.length) % rows.length;
      if (!rows[next].disabled) break;
    }
    setActive(next);
  }

  function onPopupKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'PageDown') {
      event.preventDefault();
      goToPage(safePage + 1);
    } else if (event.key === 'PageUp') {
      event.preventDefault();
      goToPage(safePage - 1);
    } else if (event.key === 'Enter' && event.target === searchRef.current) {
      event.preventDefault();
      if (rows.length === 0 && createAction) create();
      else choose(rows[active]);
    }
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (['F2', 'ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openPopup();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Start typing on a focused field to jump straight into the search.
      event.preventDefault();
      openPopup(event.key);
    } else if ((event.key === 'Backspace' || event.key === 'Delete') && emptyOption !== undefined && current) {
      event.preventDefault();
      onChange('');
    }
  }

  const heading = title ?? (placeholder !== 'Select...' ? placeholder : 'Select an option');

  return (
    <div className={`relative min-w-0 ${wrapperClassName}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => openPopup()}
        onKeyDown={onTriggerKeyDown}
        className={`flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected && (selected.value || emptyOption !== undefined) ? 'text-slate-900' : 'text-slate-400'}`}>
          {selected ? selected.label : current ? current : placeholder}
          {selected?.description && <span className="ml-1.5 text-xs text-slate-400">· {selected.description}</span>}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {/* Hidden mirror input so native form validation still enforces `required`. */}
      <input
        tabIndex={-1}
        aria-hidden
        name={name}
        value={current}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        onFocus={() => triggerRef.current?.focus()}
        className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
      />

      {open && createPortal(
        <div
          className="fixed inset-0 z-95 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
          onKeyDown={onPopupKeyDown}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white text-sm shadow-2xl ring-1 ring-black/5"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <h2 id={dialogTitleId} className="truncate text-base font-bold text-slate-900">{heading}</h2>
              <div className="flex shrink-0 items-center gap-2">
                {createAction && (
                  <button
                    type="button"
                    onClick={create}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      matches.length === 0
                        ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                        : 'border border-indigo-200 text-indigo-700 hover:bg-indigo-50'
                    }`}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    {createAction.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="border-b border-slate-100 px-5 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                    setActive(0);
                  }}
                  placeholder={searchPlaceholder}
                  aria-controls={listId}
                  aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setPage(1);
                      searchRef.current?.focus();
                    }}
                    className="rounded-md p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <ul id={listId} role="listbox" className="content-scrollbar min-h-48 flex-1 overflow-y-auto px-2 py-2">
              {rows.length === 0 && <li className="px-3 py-12 text-center text-sm text-slate-400">{noResultsText}</li>}
              {rows.map((option, index) => {
                const isSelected = option.value === current;
                return (
                  <li
                    key={`${option.value}-${start + index}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled}
                    onMouseEnter={() => !option.disabled && setActive(index)}
                    onClick={() => choose(option)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                      option.disabled
                        ? 'cursor-not-allowed text-slate-300'
                        : `cursor-pointer ${index === active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700'}`
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${option.value === '' ? 'italic text-slate-500' : 'font-medium'}`}>{option.label}</span>
                      {option.description && <span className="block truncate text-xs text-slate-400">{option.description}</span>}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span>
                  {matches.length === 0 ? '0 results' : `${start + 1}–${start + rows.length} of ${matches.length}`}
                </span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                    setActive(0);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                  aria-label="Rows per page"
                >
                  {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} / page</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage <= 1}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 font-medium text-slate-700">
                  Page {safePage} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage >= pageCount}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
