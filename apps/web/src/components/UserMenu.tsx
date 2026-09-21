import type { PublicUser } from '@docdrift/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLogout } from '../lib/auth';

export function UserMenu({ user }: { user: PublicUser }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const logout = useLogout();
  const navigate = useNavigate();

  // Close on outside click and on Escape (returning focus to the button).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const signOut = (everywhere: boolean) =>
    logout.mutate({ everywhere }, { onSettled: () => navigate('/login', { replace: true }) });

  const name = user.displayName ?? user.email;
  const itemClass =
    'block w-full rounded px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <span
          aria-hidden
          className="grid h-7 w-7 place-items-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{name}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 w-60 rounded-md border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          <p className="truncate px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
            Signed in as {user.email}
          </p>
          <button
            role="menuitem"
            type="button"
            className={itemClass}
            onClick={() => signOut(false)}
          >
            Sign out
          </button>
          <button role="menuitem" type="button" className={itemClass} onClick={() => signOut(true)}>
            Sign out on all devices
          </button>
        </div>
      )}
    </div>
  );
}
