'use client';

import { useState, type ReactNode } from 'react';
import { Users, X } from 'lucide-react'; 

interface GroupWorkspaceProps {
  sidebar: ReactNode;
  chat: ReactNode;
}

export function GroupWorkspace({ sidebar, chat }: GroupWorkspaceProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="mb-6">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="clay-btn-secondary flex w-fit items-center gap-2 rounded-full px-4 py-2 text-label-md transition-colors"
        >
          {isOpen ? (
            <>
              <X className="size-4" aria-hidden="true" />
              Close members
            </>
          ) : (
            <>
              <Users className="size-4" aria-hidden="true" />
              Show members
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {isOpen ? (
          <aside className="flex flex-col gap-6 lg:col-span-4">
            {sidebar}
          </aside>
        ) : null}

        <div className={isOpen ? 'lg:col-span-8' : 'lg:col-span-12'}>
          {chat}
        </div>
      </div>
    </>
  );
}