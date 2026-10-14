import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export function NotebookRuleRow({
  id,
  index,
  pinned,
  disabled,
  children,
}: {
  id: string;
  index: number;
  pinned: boolean;
  disabled: boolean;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    active,
  } = useSortable({ id, disabled: pinned || disabled });
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`behavior-rule${isDragging ? ' is-dragging' : ''}${isOver && !isDragging ? ' is-over' : ''}${isOver && (active?.data.current?.sortable?.index ?? index) > -1 && (active?.data.current?.sortable?.index ?? index) < index ? ' drop-after' : ''}`}
      aria-label={pinned ? 'Otherwise' : `Rule ${index + 1}`}
    >
      <div className="rule-margin">
        {pinned ? (
          <span aria-hidden="true">&#9633;</span>
        ) : (
          <button
            type="button"
            className="drag-handle"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reorder rule ${index + 1}; Space to pick up, arrow keys to move, Space to drop`}
            disabled={disabled}
          >
            &#10303;
          </button>
        )}
        <span className="rule-number" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>
      <div className="rule-body">{children}</div>
    </article>
  );
}
