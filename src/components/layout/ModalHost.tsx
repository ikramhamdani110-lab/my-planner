import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useUI } from '@/contexts/UIContext';
import { TaskForm } from '@/components/forms/TaskForm';
import { GoalForm, NoteForm } from '@/components/forms/Forms';
import { TaskDetails } from '@/components/tasks/TaskDetails';

export function ModalHost() {
  const { modal, closeModal } = useUI();
  const [detailsId, setDetailsId] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { closeModal(); setDetailsId(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeModal]);

  if (detailsId) return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDetailsId(null); }}>
      <div className="card w-[560px] max-h-[85vh] overflow-y-auto p-6">
        <TaskDetails id={detailsId} onClose={() => setDetailsId(null)} onEdit={() => { setDetailsId(null); }} />
      </div>
    </div>
  );

  if (!modal.kind) return null;
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="card w-[560px] max-h-[88vh] overflow-y-auto p-6 relative">
        <button className="absolute right-4 top-4 p-1 rounded-lg" style={{ color: 'var(--text-secondary)' }} onClick={closeModal}><X size={18} /></button>
        {modal.kind === 'task' && <TaskForm task={modal.task} defaultDate={modal.defaultDate} rescheduleMode={modal.rescheduleMode}
          onSaved={closeModal} onCancel={closeModal} onView={(id) => { closeModal(); setDetailsId(id); }} />}
        {modal.kind === 'goal' && <GoalForm onSaved={closeModal} onCancel={closeModal} />}
        {modal.kind === 'note' && <NoteForm onSaved={closeModal} onCancel={closeModal} />}
      </div>
    </div>
  );
}
