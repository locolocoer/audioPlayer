import Modal from './Modal'
import { getUpdateNote } from '../data/updateNotes'
import { useT } from '../i18n'

interface UpdateNotesModalProps {
  version: string
  onClose: () => void
}

function NoteSection({ title, items }: { title: string; items: string[] }): JSX.Element {
  return (
    <div className="update-note-section">
      <div className="update-note-label">{title}</div>
      <ul className="update-note-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export default function UpdateNotesModal({ version, onClose }: UpdateNotesModalProps): JSX.Element {
  const t = useT()
  const note = getUpdateNote(version)

  return (
    <Modal onClose={onClose} width={430}>
      <div className="update-notes">
        <h3>{t('update.notes.title')}</h3>
        <div className="update-notes-version">v{version}</div>
        {note ? (
          <div className="update-notes-body">
            {note.added && <NoteSection title={t('update.notes.added')} items={note.added} />}
            {note.fixed && <NoteSection title={t('update.notes.fixed')} items={note.fixed} />}
            {note.changed && <NoteSection title={t('update.notes.changed')} items={note.changed} />}
          </div>
        ) : (
          <p className="update-notes-body" style={{ color: 'var(--text-secondary)' }}>
            {t('update.notes.empty', { version })}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>{t('update.notes.ok')}</button>
        </div>
      </div>
    </Modal>
  )
}
