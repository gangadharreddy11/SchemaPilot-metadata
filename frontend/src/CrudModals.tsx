import React, { useState } from 'react'
import {
  AlertTriangle,
  Check,
  CircleHelp,
  Columns,
  Database,
  Edit,
  KeyRound,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
  X
} from 'lucide-react'

export const PG_DATA_TYPES = [
  'INTEGER',
  'BIGINT',
  'SMALLINT',
  'SERIAL',
  'BIGSERIAL',
  'VARCHAR(255)',
  'VARCHAR(100)',
  'VARCHAR(50)',
  'TEXT',
  'CHAR(1)',
  'BOOLEAN',
  'NUMERIC(10,2)',
  'NUMERIC',
  'REAL',
  'DOUBLE PRECISION',
  'DATE',
  'TIMESTAMP',
  'TIMESTAMPTZ',
  'TIME',
  'UUID',
  'JSON',
  'JSONB',
  'BYTEA'
]

export function validateIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name.trim()) && name.trim().length <= 63
}

type ColumnInfo = {
  ordinal_position: number
  name: string
  data_type: string
  nullable: boolean
  default: string | null
  primary_key: boolean
  foreign_key: boolean
  unique: boolean
  autoincrement: string
  comment?: string | null
}

// ═══════════════════════════════════════════════════════════════
// 1. ConfirmDialog Component
// ═══════════════════════════════════════════════════════════════

interface ConfirmDialogProps {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <div className="api-modal-backdrop" onClick={onCancel}>
      <div className="api-modal" onClick={e => e.stopPropagation()} role="dialog" style={{ maxWidth: 460 }}>
        <div className="api-modal-header">
          <div className="api-modal-title">
            <div
              className="provider-icon"
              style={{
                background: destructive ? 'var(--error-bg)' : 'var(--accent-muted)',
                color: destructive ? 'var(--error)' : 'var(--accent)',
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              {destructive ? <AlertTriangle size={18} /> : <CircleHelp size={18} />}
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h3>
            </div>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="api-modal-body">
          <div className={`crud-warning-box ${destructive ? 'danger' : ''}`}>
            {destructive && <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />}
            <span style={{ fontSize: 13 }}>{message}</span>
          </div>
        </div>

        <div className="api-modal-footer">
          <button className="button secondary" onClick={onCancel} disabled={loading}>
            {cancelText}
          </button>
          <button
            className={`button ${destructive ? 'danger' : 'primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <RefreshCw size={13} className="spinning" /> : <Check size={13} />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 2. CreateTableModal Component
// ═══════════════════════════════════════════════════════════════

interface ColumnDraft {
  id: string
  name: string
  data_type: string
  primary_key: boolean
  nullable: boolean
  unique: boolean
  default_value: string
}

interface CreateTableModalProps {
  apiUrl: string
  schema: string
  onSuccess: (newTableName?: string) => void
  onClose: () => void
}

export function CreateTableModal({ apiUrl, schema, onSuccess, onClose }: CreateTableModalProps) {
  const [tableName, setTableName] = useState('')
  const [columns, setColumns] = useState<ColumnDraft[]>([
    { id: '1', name: 'id', data_type: 'SERIAL', primary_key: true, nullable: false, unique: false, default_value: '' },
    { id: '2', name: 'name', data_type: 'VARCHAR(255)', primary_key: false, nullable: false, unique: false, default_value: '' }
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleAddColumn() {
    setColumns(prev => [
      ...prev,
      {
        id: String(Date.now()),
        name: `column_${prev.length + 1}`,
        data_type: 'VARCHAR(255)',
        primary_key: false,
        nullable: true,
        unique: false,
        default_value: ''
      }
    ])
  }

  function handleRemoveColumn(id: string) {
    if (columns.length <= 1) {
      setError('Table must have at least one column.')
      return
    }
    setColumns(prev => prev.filter(c => c.id !== id))
  }

  function handleUpdateColumn(id: string, field: keyof ColumnDraft, val: any) {
    setColumns(prev =>
      prev.map(c => {
        if (c.id !== id) return c
        const updated = { ...c, [field]: val }
        // If primary key is checked, nullable must be false
        if (field === 'primary_key' && val === true) {
          updated.nullable = false
        }
        return updated
      })
    )
  }

  // Generate preview DDL
  const ddlPreview = React.useMemo(() => {
    const tName = tableName.trim() || 'new_table'
    const colStrings = columns.map(c => {
      const parts = [`"${c.name.trim() || 'col'}"`, c.data_type]
      if (!c.nullable) parts.push('NOT NULL')
      if (c.unique) parts.push('UNIQUE')
      if (c.default_value.trim()) parts.push(`DEFAULT ${c.default_value.trim()}`)
      if (c.primary_key) parts.push('PRIMARY KEY')
      return `  ${parts.join(' ')}`
    })
    return `CREATE TABLE "${schema}"."${tName}" (\n${colStrings.join(',\n')}\n);`
  }, [tableName, columns, schema])

  async function handleSubmit() {
    const cleanTableName = tableName.trim()
    if (!cleanTableName) {
      setError('Please provide a table name.')
      return
    }
    if (!validateIdentifier(cleanTableName)) {
      setError('Invalid table name. Must start with a letter/underscore and contain only alphanumeric characters or underscores.')
      return
    }

    // Validate columns
    const names = new Set<string>()
    for (const c of columns) {
      const colName = c.name.trim()
      if (!colName) {
        setError('Column names cannot be empty.')
        return
      }
      if (!validateIdentifier(colName)) {
        setError(`Invalid column name: "${colName}".`)
        return
      }
      if (names.has(colName.toLowerCase())) {
        setError(`Duplicate column name: "${colName}".`)
        return
      }
      names.add(colName.toLowerCase())
    }

    setLoading(true)
    setError('')
    try {
      const base = apiUrl.replace(/\/+$/, '')
      const res = await fetch(`${base}/api/tables/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: cleanTableName,
          schema_name: schema,
          columns: columns.map(c => ({
            name: c.name.trim(),
            data_type: c.data_type,
            primary_key: c.primary_key,
            nullable: c.nullable,
            unique: c.unique,
            default_value: c.default_value.trim() || null
          }))
        })
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Failed to create table (${res.status})`)
      }

      onSuccess(cleanTableName)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create table')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="api-modal-backdrop" onClick={onClose}>
      <div className="api-modal" onClick={e => e.stopPropagation()} role="dialog" style={{ maxWidth: 780 }}>
        <div className="api-modal-header">
          <div className="api-modal-title">
            <div
              className="provider-icon"
              style={{
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <Table2 size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Create New Table</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                Define table name, columns, data types, and constraints in schema <b>{schema}</b>.
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="api-modal-body" style={{ maxHeight: 'calc(80vh - 120px)', overflowY: 'auto' }}>
          {error && (
            <div className="error-banner" style={{ margin: 0 }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="conn-field">
            <label>
              <span>Table Name *</span>
            </label>
            <input
              className="conn-input"
              placeholder="e.g. customers, invoices, inventory"
              value={tableName}
              onChange={e => {
                setTableName(e.target.value)
                setError('')
              }}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Columns Definition ({columns.length})
            </span>
            <button type="button" className="button small primary" onClick={handleAddColumn}>
              <Plus size={12} /> Add Column
            </button>
          </div>

          <div className="crud-columns-container">
            {columns.map((col, idx) => (
              <div key={col.id} className="crud-column-row">
                <input
                  className="crud-input-sm"
                  placeholder="col_name"
                  value={col.name}
                  onChange={e => handleUpdateColumn(col.id, 'name', e.target.value)}
                />

                <select
                  className="crud-select"
                  value={col.data_type}
                  onChange={e => handleUpdateColumn(col.id, 'data_type', e.target.value)}
                >
                  {PG_DATA_TYPES.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <label className="crud-checkbox-label" title="Primary Key">
                  <input
                    type="checkbox"
                    checked={col.primary_key}
                    onChange={e => handleUpdateColumn(col.id, 'primary_key', e.target.checked)}
                  />
                  <span>PK</span>
                </label>

                <label className="crud-checkbox-label" title="Allow NULL values">
                  <input
                    type="checkbox"
                    checked={col.nullable}
                    disabled={col.primary_key}
                    onChange={e => handleUpdateColumn(col.id, 'nullable', e.target.checked)}
                  />
                  <span>Null</span>
                </label>

                <label className="crud-checkbox-label" title="Unique Constraint">
                  <input
                    type="checkbox"
                    checked={col.unique}
                    onChange={e => handleUpdateColumn(col.id, 'unique', e.target.checked)}
                  />
                  <span>UQ</span>
                </label>

                <input
                  className="crud-input-sm"
                  placeholder="Default (opt)"
                  value={col.default_value}
                  onChange={e => handleUpdateColumn(col.id, 'default_value', e.target.value)}
                />

                <button
                  type="button"
                  className="icon-button"
                  style={{ width: 28, height: 28 }}
                  onClick={() => handleRemoveColumn(col.id)}
                  title="Remove column"
                  disabled={columns.length <= 1}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              DDL Structure Preview
            </span>
            <div className="crud-sql-preview" style={{ marginTop: 4 }}>
              {ddlPreview}
            </div>
          </div>
        </div>

        <div className="api-modal-footer">
          <button className="button secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="button primary" onClick={handleSubmit} disabled={loading}>
            {loading ? <RefreshCw size={13} className="spinning" /> : <Check size={13} />}
            Create Table
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 3. RenameTableModal Component
// ═══════════════════════════════════════════════════════════════

interface RenameTableModalProps {
  apiUrl: string
  schema: string
  tableName: string
  onSuccess: (newName: string) => void
  onClose: () => void
}

export function RenameTableModal({ apiUrl, schema, tableName, onSuccess, onClose }: RenameTableModalProps) {
  const [newName, setNewName] = useState(tableName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRename() {
    const clean = newName.trim()
    if (!clean) {
      setError('Please provide a new table name.')
      return
    }
    if (clean === tableName) {
      onClose()
      return
    }
    if (!validateIdentifier(clean)) {
      setError('Invalid table name format.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const base = apiUrl.replace(/\/+$/, '')
      const res = await fetch(`${base}/api/tables/${encodeURIComponent(tableName)}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_name: clean,
          schema_name: schema
        })
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Failed to rename table (${res.status})`)
      }

      onSuccess(clean)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="api-modal-backdrop" onClick={onClose}>
      <div className="api-modal" onClick={e => e.stopPropagation()} role="dialog" style={{ maxWidth: 480 }}>
        <div className="api-modal-header">
          <div className="api-modal-title">
            <div
              className="provider-icon"
              style={{
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <Edit size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Rename Table</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                Change table identifier from <code>{tableName}</code>
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="api-modal-body">
          {error && (
            <div className="error-banner" style={{ margin: 0 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="conn-field">
            <label>
              <span>Current Table Name</span>
            </label>
            <input className="conn-input" value={tableName} disabled />
          </div>

          <div className="conn-field">
            <label>
              <span>New Table Name *</span>
            </label>
            <input
              className="conn-input"
              value={newName}
              onChange={e => {
                setNewName(e.target.value)
                setError('')
              }}
              autoFocus
            />
          </div>
        </div>

        <div className="api-modal-footer">
          <button className="button secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="button primary" onClick={handleRename} disabled={loading}>
            {loading ? <RefreshCw size={13} className="spinning" /> : <Check size={13} />}
            Rename Table
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 4. AddColumnModal Component
// ═══════════════════════════════════════════════════════════════

interface AddColumnModalProps {
  apiUrl: string
  schema: string
  tableName: string
  onSuccess: () => void
  onClose: () => void
}

export function AddColumnModal({ apiUrl, schema, tableName, onSuccess, onClose }: AddColumnModalProps) {
  const [colName, setColName] = useState('')
  const [dataType, setDataType] = useState('VARCHAR(255)')
  const [nullable, setNullable] = useState(true)
  const [unique, setUnique] = useState(false)
  const [defaultValue, setDefaultValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAdd() {
    const cleanName = colName.trim()
    if (!cleanName) {
      setError('Please provide a column name.')
      return
    }
    if (!validateIdentifier(cleanName)) {
      setError('Invalid column name format.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const base = apiUrl.replace(/\/+$/, '')
      const res = await fetch(`${base}/api/tables/${encodeURIComponent(tableName)}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          data_type: dataType,
          nullable,
          unique,
          default_value: defaultValue.trim() || null,
          schema_name: schema
        })
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Failed to add column (${res.status})`)
      }

      onSuccess()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add column')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="api-modal-backdrop" onClick={onClose}>
      <div className="api-modal" onClick={e => e.stopPropagation()} role="dialog" style={{ maxWidth: 500 }}>
        <div className="api-modal-header">
          <div className="api-modal-title">
            <div
              className="provider-icon"
              style={{
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <Columns size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Add Column</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                Table: <code>{tableName}</code> (schema: {schema})
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="api-modal-body">
          {error && (
            <div className="error-banner" style={{ margin: 0 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="conn-field">
            <label>
              <span>Column Name *</span>
            </label>
            <input
              className="conn-input"
              placeholder="e.g. phone_number, status, description"
              value={colName}
              onChange={e => {
                setColName(e.target.value)
                setError('')
              }}
              autoFocus
            />
          </div>

          <div className="conn-field">
            <label>
              <span>Data Type *</span>
            </label>
            <select className="crud-select" value={dataType} onChange={e => setDataType(e.target.value)}>
              {PG_DATA_TYPES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 16, margin: '6px 0' }}>
            <label className="crud-checkbox-label">
              <input type="checkbox" checked={nullable} onChange={e => setNullable(e.target.checked)} />
              <span>Allow NULL values</span>
            </label>
            <label className="crud-checkbox-label">
              <input type="checkbox" checked={unique} onChange={e => setUnique(e.target.checked)} />
              <span>UNIQUE constraint</span>
            </label>
          </div>

          <div className="conn-field">
            <label>
              <span>Default Value (Optional)</span>
            </label>
            <input
              className="conn-input"
              placeholder="e.g. 'active', 0, CURRENT_TIMESTAMP"
              value={defaultValue}
              onChange={e => setDefaultValue(e.target.value)}
            />
          </div>
        </div>

        <div className="api-modal-footer">
          <button className="button secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="button primary" onClick={handleAdd} disabled={loading}>
            {loading ? <RefreshCw size={13} className="spinning" /> : <Check size={13} />}
            Add Column
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 5. EditColumnModal Component
// ═══════════════════════════════════════════════════════════════

interface EditColumnModalProps {
  apiUrl: string
  schema: string
  tableName: string
  column: ColumnInfo
  onSuccess: () => void
  onClose: () => void
}

export function EditColumnModal({ apiUrl, schema, tableName, column, onSuccess, onClose }: EditColumnModalProps) {
  const [dataType, setDataType] = useState(column.data_type)
  const [nullable, setNullable] = useState(column.nullable)
  const [unique, setUnique] = useState(column.unique)
  const [defaultValue, setDefaultValue] = useState(column.default || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleModify() {
    setLoading(true)
    setError('')
    try {
      const base = apiUrl.replace(/\/+$/, '')
      const payload: Record<string, any> = { schema_name: schema }

      if (dataType !== column.data_type) payload.data_type = dataType
      if (nullable !== column.nullable) payload.nullable = nullable
      if (unique !== column.unique) payload.unique = unique
      if (defaultValue !== (column.default || '')) payload.default_value = defaultValue

      const res = await fetch(
        `${base}/api/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(column.name)}/modify`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      )

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Modification failed (${res.status})`)
      }

      onSuccess()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Modification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="api-modal-backdrop" onClick={onClose}>
      <div className="api-modal" onClick={e => e.stopPropagation()} role="dialog" style={{ maxWidth: 500 }}>
        <div className="api-modal-header">
          <div className="api-modal-title">
            <div
              className="provider-icon"
              style={{
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <Columns size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Modify Column Attributes</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                Column: <code>{column.name}</code> in table <code>{tableName}</code>
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="api-modal-body">
          {error && (
            <div className="error-banner" style={{ margin: 0 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="conn-field">
            <label>
              <span>Column Name</span>
            </label>
            <input className="conn-input" value={column.name} disabled />
          </div>

          <div className="conn-field">
            <label>
              <span>Data Type</span>
            </label>
            <select className="crud-select" value={dataType} onChange={e => setDataType(e.target.value)}>
              {PG_DATA_TYPES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 16, margin: '6px 0' }}>
            <label className="crud-checkbox-label">
              <input
                type="checkbox"
                checked={nullable}
                disabled={column.primary_key}
                onChange={e => setNullable(e.target.checked)}
              />
              <span>Nullable</span>
            </label>
            <label className="crud-checkbox-label">
              <input type="checkbox" checked={unique} onChange={e => setUnique(e.target.checked)} />
              <span>UNIQUE constraint</span>
            </label>
          </div>

          <div className="conn-field">
            <label>
              <span>Default Value (leave empty to drop)</span>
            </label>
            <input
              className="conn-input"
              placeholder="e.g. 'draft', 0"
              value={defaultValue}
              onChange={e => setDefaultValue(e.target.value)}
            />
          </div>
        </div>

        <div className="api-modal-footer">
          <button className="button secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="button primary" onClick={handleModify} disabled={loading}>
            {loading ? <RefreshCw size={13} className="spinning" /> : <Check size={13} />}
            Save Attributes
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 6. RenameColumnModal Component
// ═══════════════════════════════════════════════════════════════

interface RenameColumnModalProps {
  apiUrl: string
  schema: string
  tableName: string
  column: ColumnInfo
  onSuccess: () => void
  onClose: () => void
}

export function RenameColumnModal({ apiUrl, schema, tableName, column, onSuccess, onClose }: RenameColumnModalProps) {
  const [newName, setNewName] = useState(column.name)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRename() {
    const clean = newName.trim()
    if (!clean) {
      setError('Please provide a column name.')
      return
    }
    if (clean === column.name) {
      onClose()
      return
    }
    if (!validateIdentifier(clean)) {
      setError('Invalid column identifier format.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const base = apiUrl.replace(/\/+$/, '')
      const res = await fetch(
        `${base}/api/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(column.name)}/rename`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_name: clean,
            schema_name: schema
          })
        }
      )

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Rename column failed (${res.status})`)
      }

      onSuccess()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="api-modal-backdrop" onClick={onClose}>
      <div className="api-modal" onClick={e => e.stopPropagation()} role="dialog" style={{ maxWidth: 460 }}>
        <div className="api-modal-header">
          <div className="api-modal-title">
            <div
              className="provider-icon"
              style={{
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <Edit size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Rename Column</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                Table <code>{tableName}</code>
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="api-modal-body">
          {error && (
            <div className="error-banner" style={{ margin: 0 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="conn-field">
            <label>
              <span>Current Column Name</span>
            </label>
            <input className="conn-input" value={column.name} disabled />
          </div>

          <div className="conn-field">
            <label>
              <span>New Column Name *</span>
            </label>
            <input
              className="conn-input"
              value={newName}
              onChange={e => {
                setNewName(e.target.value)
                setError('')
              }}
              autoFocus
            />
          </div>
        </div>

        <div className="api-modal-footer">
          <button className="button secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="button primary" onClick={handleRename} disabled={loading}>
            {loading ? <RefreshCw size={13} className="spinning" /> : <Check size={13} />}
            Rename Column
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 7. AddRowModal Component
// ═══════════════════════════════════════════════════════════════

interface AddRowModalProps {
  apiUrl: string
  schema: string
  tableName: string
  columns: ColumnInfo[]
  onSuccess: () => void
  onClose: () => void
}

export function AddRowModal({ apiUrl, schema, tableName, columns, onSuccess, onClose }: AddRowModalProps) {
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Determine insertable columns (skip autoincrement/identity PKs)
  const insertableCols = columns.filter(c => {
    const dt = c.data_type.toUpperCase()
    if (c.primary_key && (dt.includes('SERIAL') || c.autoincrement === 'True')) return false
    return true
  })

  function handleChange(colName: string, val: string) {
    setFormData(prev => ({ ...prev, [colName]: val }))
  }

  async function handleInsert() {
    setLoading(true)
    setError('')
    try {
      const record: Record<string, any> = {}

      for (const c of insertableCols) {
        const raw = formData[c.name]
        if (raw !== undefined && raw.trim() !== '') {
          const dt = c.data_type.toUpperCase()
          if (/INT|BIGINT|SMALLINT/.test(dt)) {
            record[c.name] = parseInt(raw.trim(), 10)
          } else if (/NUMERIC|DECIMAL|FLOAT|REAL|DOUBLE/.test(dt)) {
            record[c.name] = parseFloat(raw.trim())
          } else if (/BOOL/.test(dt)) {
            record[c.name] = raw.trim().toLowerCase() === 'true' || raw.trim() === '1'
          } else {
            record[c.name] = raw.trim()
          }
        } else if (!c.nullable && c.default === null) {
          throw new Error(`Field "${c.name}" is required (NOT NULL with no default).`)
        }
      }

      if (Object.keys(record).length === 0) {
        throw new Error('Please fill in at least one field.')
      }

      const base = apiUrl.replace(/\/+$/, '')
      const res = await fetch(`${base}/api/tables/${encodeURIComponent(tableName)}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema_name: schema,
          record
        })
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Insert failed (${res.status})`)
      }

      onSuccess()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Insert failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="api-modal-backdrop" onClick={onClose}>
      <div className="api-modal" onClick={e => e.stopPropagation()} role="dialog" style={{ maxWidth: 560 }}>
        <div className="api-modal-header">
          <div className="api-modal-title">
            <div
              className="provider-icon"
              style={{
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <Plus size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Add Record</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                Insert new row into <code>{tableName}</code>
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="api-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {error && (
            <div className="error-banner" style={{ margin: 0 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {insertableCols.map(c => {
            const isRequired = !c.nullable && c.default === null
            return (
              <div key={c.name} className="conn-field">
                <label>
                  <span>
                    {c.name} {isRequired && <b style={{ color: 'var(--error)' }}>*</b>}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{c.data_type}</span>
                </label>
                <input
                  className="conn-input"
                  placeholder={isRequired ? 'Required' : c.default ? `Default: ${c.default}` : 'NULL'}
                  value={formData[c.name] ?? ''}
                  onChange={e => handleChange(c.name, e.target.value)}
                />
              </div>
            )
          })}
        </div>

        <div className="api-modal-footer">
          <button className="button secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="button primary" onClick={handleInsert} disabled={loading}>
            {loading ? <RefreshCw size={13} className="spinning" /> : <Check size={13} />}
            Insert Record
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 8. EditRowModal Component
// ═══════════════════════════════════════════════════════════════

interface EditRowModalProps {
  apiUrl: string
  schema: string
  tableName: string
  columns: ColumnInfo[]
  row: Record<string, unknown>
  primaryKey: any
  onSuccess: () => void
  onClose: () => void
}

export function EditRowModal({
  apiUrl,
  schema,
  tableName,
  columns,
  row,
  primaryKey,
  onSuccess,
  onClose
}: EditRowModalProps) {
  const pkCols = (primaryKey?.constrained_columns || []) as string[]
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    columns.forEach(c => {
      const v = row[c.name]
      initial[c.name] = v === null || v === undefined ? '' : String(v)
    })
    return initial
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(colName: string, val: string) {
    setFormData(prev => ({ ...prev, [colName]: val }))
  }

  async function handleUpdate() {
    if (pkCols.length === 0) {
      setError('Cannot update record: Table has no primary key.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const pkObj: Record<string, any> = {}
      pkCols.forEach(pk => {
        pkObj[pk] = row[pk]
      })

      const updates: Record<string, any> = {}
      for (const c of columns) {
        if (pkCols.includes(c.name)) continue
        const originalVal = row[c.name]
        const currentStr = formData[c.name] ?? ''

        if (originalVal === null && currentStr === '') continue
        if (String(originalVal ?? '') === currentStr) continue

        if (currentStr === '') {
          if (!c.nullable) {
            throw new Error(`Field "${c.name}" cannot be NULL.`)
          }
          updates[c.name] = null
        } else {
          const dt = c.data_type.toUpperCase()
          if (/INT|BIGINT|SMALLINT/.test(dt)) {
            updates[c.name] = parseInt(currentStr.trim(), 10)
          } else if (/NUMERIC|DECIMAL|FLOAT|REAL|DOUBLE/.test(dt)) {
            updates[c.name] = parseFloat(currentStr.trim())
          } else if (/BOOL/.test(dt)) {
            updates[c.name] = currentStr.trim().toLowerCase() === 'true' || currentStr.trim() === '1'
          } else {
            updates[c.name] = currentStr
          }
        }
      }

      if (Object.keys(updates).length === 0) {
        onClose()
        return
      }

      const base = apiUrl.replace(/\/+$/, '')
      const res = await fetch(`${base}/api/tables/${encodeURIComponent(tableName)}/records`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema_name: schema,
          primary_key: pkObj,
          updates
        })
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Update failed (${res.status})`)
      }

      onSuccess()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="api-modal-backdrop" onClick={onClose}>
      <div className="api-modal" onClick={e => e.stopPropagation()} role="dialog" style={{ maxWidth: 560 }}>
        <div className="api-modal-header">
          <div className="api-modal-title">
            <div
              className="provider-icon"
              style={{
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <Edit size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Edit Record</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                Table <code>{tableName}</code> · PK:{' '}
                <code>{pkCols.map(p => `${p}=${row[p]}`).join(', ')}</code>
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="api-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {error && (
            <div className="error-banner" style={{ margin: 0 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {columns.map(c => {
            const isPk = pkCols.includes(c.name)
            return (
              <div key={c.name} className="conn-field">
                <label>
                  <span>
                    {c.name} {isPk && <span className="pill primary" style={{ fontSize: 9, marginLeft: 4 }}>PK (read-only)</span>}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{c.data_type}</span>
                </label>
                <input
                  className="conn-input"
                  value={formData[c.name] ?? ''}
                  disabled={isPk}
                  onChange={e => handleChange(c.name, e.target.value)}
                />
              </div>
            )
          })}
        </div>

        <div className="api-modal-footer">
          <button className="button secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="button primary" onClick={handleUpdate} disabled={loading}>
            {loading ? <RefreshCw size={13} className="spinning" /> : <Check size={13} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 9. ViewTableStructureModal Component
// ═══════════════════════════════════════════════════════════════

interface ViewTableStructureModalProps {
  apiUrl: string
  schema: string
  tableName: string
  onClose: () => void
}

export function ViewTableStructureModal({ apiUrl, schema, tableName, onClose }: ViewTableStructureModalProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const base = apiUrl.replace(/\/+$/, '')
        const res = await fetch(
          `${base}/api/tables/${encodeURIComponent(tableName)}/structure?schema=${encodeURIComponent(schema)}`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setData(json)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load structure')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [apiUrl, schema, tableName])

  return (
    <div className="api-modal-backdrop" onClick={onClose}>
      <div className="api-modal" onClick={e => e.stopPropagation()} role="dialog" style={{ maxWidth: 720 }}>
        <div className="api-modal-header">
          <div className="api-modal-title">
            <div
              className="provider-icon"
              style={{
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <Database size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Table Structure</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                Full schema definition for <code>{tableName}</code> in {schema}
              </p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="api-modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          {loading ? (
            <div className="empty">
              <RefreshCw size={16} className="spinning" /> Loading table structure…
            </div>
          ) : error ? (
            <div className="error-banner">
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          ) : data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Columns ({data.columns?.length || 0})</strong>
                <div className="data-table-wrap" style={{ marginTop: 6 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Nullable</th>
                        <th>Key / Constraint</th>
                        <th>Default</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.columns?.map((c: any) => (
                        <tr key={c.name}>
                          <td>
                            <strong>{c.name}</strong>
                          </td>
                          <td>
                            <code>{c.type}</code>
                          </td>
                          <td>
                            <span className={c.nullable ? 'pill neutral' : 'pill required'}>
                              {c.nullable ? 'YES' : 'NO'}
                            </span>
                          </td>
                          <td>{c.primary_key ? <span className="pill primary">PRIMARY KEY</span> : '—'}</td>
                          <td>{c.default || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {data.foreign_keys && data.foreign_keys.length > 0 && (
                <div>
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    Foreign Keys ({data.foreign_keys.length})
                  </strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                    {data.foreign_keys.map((fk: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          background: 'var(--bg-surface-0)',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-md)',
                          fontSize: 12
                        }}
                      >
                        <code>{(fk.constrained_columns || []).join(', ')}</code> →{' '}
                        <strong>{fk.referred_table}</strong>(
                        <code>{(fk.referred_columns || []).join(', ')}</code>)
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="api-modal-footer">
          <button className="button secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

