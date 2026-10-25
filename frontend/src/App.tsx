import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Bookmark,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  GitBranch,
  Globe,
  KeyRound,
  LayoutDashboard,
  Menu,
  Moon,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Table2,
  Trash2,
  X
} from 'lucide-react'

const DEFAULT_API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

type FilterRule = {
  id: string
  column: string
  operator: string
  value: string
}

type SavedSelection = {
  id: string
  name: string
  description?: string
  schema_name: string
  table: string
  columns: string[]
  filters: { column: string; operator: string; value: any }[]
  conjunction: 'AND' | 'OR'
  created_at: string
}

type QueryResult = {
  schema: string
  table: string
  columns: string[]
  total_matching: number
  limit: number
  offset: number
  rows: Record<string, unknown>[]
}

function getOperatorsForType(dataType: string) {
  const dt = (dataType || '').toUpperCase()
  const isNumeric = /INT|NUMERIC|DECIMAL|FLOAT|DOUBLE|REAL|SERIAL|BIGINT|SMALLINT/.test(dt)
  const isDate = /DATE|TIME|TIMESTAMP/.test(dt)
  const isBoolean = /BOOL/.test(dt)

  if (isNumeric) {
    return [
      { value: 'equals', label: '= Equals' },
      { value: 'not_equals', label: '!= Not equals' },
      { value: 'greater_than', label: '> Greater than' },
      { value: 'greater_than_or_equal', label: '>= Greater than or equal' },
      { value: 'less_than', label: '< Less than' },
      { value: 'less_than_or_equal', label: '<= Less than or equal' },
      { value: 'is_empty', label: 'Is empty / NULL' },
      { value: 'is_not_empty', label: 'Is not empty / NOT NULL' },
    ]
  }

  if (isDate) {
    return [
      { value: 'equals', label: '= On date' },
      { value: 'not_equals', label: '!= Not on date' },
      { value: 'greater_than', label: '> After date' },
      { value: 'greater_than_or_equal', label: '>= On or after' },
      { value: 'less_than', label: '< Before date' },
      { value: 'less_than_or_equal', label: '<= On or before' },
      { value: 'is_empty', label: 'Is empty / NULL' },
      { value: 'is_not_empty', label: 'Is not empty / NOT NULL' },
    ]
  }

  if (isBoolean) {
    return [
      { value: 'equals', label: '= Equals (true / false)' },
      { value: 'is_empty', label: 'Is empty / NULL' },
      { value: 'is_not_empty', label: 'Is not empty' },
    ]
  }

  // String / Text
  return [
    { value: 'contains', label: 'Contains (case-insensitive)' },
    { value: 'equals', label: '= Equals exact' },
    { value: 'not_equals', label: '!= Not equals' },
    { value: 'starts_with', label: 'Starts with' },
    { value: 'ends_with', label: 'Ends with' },
    { value: 'is_empty', label: 'Is empty (blank or NULL)' },
    { value: 'is_not_empty', label: 'Is not empty' },
  ]
}

function exportToExcelCSV(table: string, columns: string[], rows: Record<string, unknown>[]) {
  if (!rows || rows.length === 0) return
  const header = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(',')
  const lines = rows.map(r =>
    columns.map(c => {
      const v = r[c]
      if (v === null || v === undefined) return '""'
      return `"${String(v).replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv = '\uFEFF' + [header, ...lines].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `schemapilot-${table}-selection.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportToExcelXLS(table: string, columns: string[], rows: Record<string, unknown>[]) {
  if (!rows || rows.length === 0) return
  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">'
  html += '<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Selection</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>'
  html += '<table border="1"><thead><tr>'
  columns.forEach(c => { html += `<th style="background-color:#0f172a;color:#3ecfb4;font-weight:bold;padding:8px 14px;">${c}</th>` })
  html += '</tr></thead><tbody>'
  rows.forEach(r => {
    html += '<tr>'
    columns.forEach(c => {
      const val = r[c] === null || r[c] === undefined ? '' : String(r[c])
      html += `<td style="padding:6px 10px;">${val.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`
    })
    html += '</tr>'
  })
  html += '</tbody></table></body></html>'
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `schemapilot-${table}-selection.xls`
  a.click()
  URL.revokeObjectURL(url)
}

function exportSelectionJSON(table: string, columns: string[], rows: Record<string, unknown>[]) {
  const payload = JSON.stringify(rows, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `schemapilot-${table}-selection.json`
  a.click()
  URL.revokeObjectURL(url)
}


type TableInfo = {
  schema: string
  name: string
  column_count: number
  primary_key_constraint_count: number
  primary_key_column_count: number
  foreign_key_constraint_count: number
  index_count: number
  unique_constraint_count: number
  check_constraint_count: number
  constraint_count: number
}

type Summary = {
  schema: string
  table_count: number
  column_count: number
  primary_key_constraint_count: number
  foreign_key_constraint_count: number
  index_count: number
  unique_constraint_count: number
  check_constraint_count: number
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

type Detail = {
  schema: string
  table: string
  column_count: number
  primary_key: any
  foreign_keys: any[]
  indexes: any[]
  unique_constraints: any[]
  check_constraints: any[]
  columns: ColumnInfo[]
}

type Rows = {
  columns: string[]
  rows: Record<string, unknown>[]
  offset: number
  limit: number
}

type ConnectionInfo = {
  status: string
  database_url: string
  dialect: string
  database: string
  host: string
  port: string | number
  username: string
  default_schema: string
}

type ProviderType = 'mysql' | 'postgres' | 'supabase' | 'oracle' | 'mssql' | 'sqlite'

interface ProviderPreset {
  id: ProviderType
  name: string
  tag: string
  driver: string
  template: string
  tip: string
}

const PROVIDERS: ProviderPreset[] = [
  {
    id: 'mysql',
    name: 'MySQL',
    tag: 'MariaDB / Aurora',
    driver: 'mysql+pymysql',
    template: 'mysql://root:password@localhost:3306/schemapilot',
    tip: 'Format: mysql://[user]:[password]@[host]:[port]/[database]'
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    tag: 'ElephantSQL / Self-hosted',
    driver: 'postgresql+psycopg2',
    template: 'postgresql://postgres:password@localhost:5432/postgres',
    tip: 'Format: postgresql://[user]:[password]@[host]:[port]/[database]'
  },
  {
    id: 'supabase',
    name: 'Supabase',
    tag: 'Cloud PostgreSQL',
    driver: 'postgresql+psycopg2',
    template: 'postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres',
    tip: 'Important: Direct (db.*.supabase.co) requires IPv6. For Windows/IPv4, copy the "Connection Pooler" URI (port 6543 or 5432) from Supabase Dashboard → Project Settings → Database → Connection string.'
  },
  {
    id: 'oracle',
    name: 'Oracle Database',
    tag: 'Autonomous / XE / 19c+',
    driver: 'oracle+oracledb',
    template: 'oracle://system:password@localhost:1521/?service_name=FREEPDB1',
    tip: 'Format: oracle://[user]:[password]@[host]:[port]/?service_name=[SERVICE_NAME]'
  },
  {
    id: 'mssql',
    name: 'Microsoft SQL Server',
    tag: 'Azure SQL / Express',
    driver: 'mssql+pymssql',
    template: 'mssql://sa:YourPassword123@localhost:1433/master',
    tip: 'Format: mssql://[user]:[password]@[host]:[port]/[database]'
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    tag: 'Embedded / Local file',
    driver: 'sqlite',
    template: 'sqlite:///schemapilot.db',
    tip: 'Format: sqlite:///[path/to/database.db]'
  }
]

type SavedConnection = {
  id: string
  name: string
  provider: ProviderType
  url: string
}

function App() {
  const [nav, setNav] = useState<'Overview' | 'Saved Data Selections' | 'Connections' | 'Schemas' | 'Tables' | 'Relationships'>('Overview')
  const [schema, setSchema] = useState('public')
  const [schemas, setSchemas] = useState<string[]>(['public'])
  const [tables, setTables] = useState<TableInfo[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [rows, setRows] = useState<Rows | null>(null)
  const [tab, setTab] = useState('Columns')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>('loading')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [offset, setOffset] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem('schemapilot_theme')
      if (stored === 'dark' || stored === 'light') return stored
    } catch {}
    return 'light' // Default to light mode for the redesign
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('schemapilot_theme', theme)
    } catch {}
  }, [theme])

  // ─── Saved Data Selections Studio State ───
  const [selTable, setSelTable] = useState<string>('customers')
  const [selTableSearch, setSelTableSearch] = useState<string>('')
  const [selColSearch, setSelColSearch] = useState<string>('')
  const [selColumns, setSelColumns] = useState<string[]>(['name', 'email'])
  const [selFilters, setSelFilters] = useState<FilterRule[]>([])
  const [selConjunction, setSelConjunction] = useState<'AND' | 'OR'>('AND')
  const [selTableDetail, setSelTableDetail] = useState<Detail | null>(null)
  const [selLoadingDetail, setSelLoadingDetail] = useState<boolean>(false)
  const [selQuerying, setSelQuerying] = useState<boolean>(false)
  const [selQueryResult, setSelQueryResult] = useState<QueryResult | null>(null)
  const [selQueryError, setSelQueryError] = useState<string>('')
  const [savedSelections, setSavedSelections] = useState<SavedSelection[]>(() => {
    try {
      const stored = localStorage.getItem('schemapilot_saved_selections')
      if (stored) return JSON.parse(stored)
    } catch {}
    return [
      {
        id: 'preset-1',
        name: 'Customers with "Ravi"',
        description: 'Filters customers whose name contains Ravi',
        schema_name: 'public',
        table: 'customers',
        columns: ['name', 'email'],
        filters: [{ column: 'name', operator: 'contains', value: 'Ravi' }],
        conjunction: 'AND',
        created_at: '2026-01-01T00:00:00Z'
      },
      {
        id: 'preset-2',
        name: 'Completed Payments',
        description: "All payments with payment_status = 'completed'",
        schema_name: 'public',
        table: 'payments',
        columns: ['payment_id', 'amount', 'payment_status', 'paid_at'],
        filters: [{ column: 'payment_status', operator: 'equals', value: 'completed' }],
        conjunction: 'AND',
        created_at: '2026-01-01T00:00:00Z'
      },
      {
        id: 'preset-3',
        name: 'High Value Products (> 100)',
        description: 'Products with unit price greater than 100',
        schema_name: 'public',
        table: 'products',
        columns: ['name', 'price', 'stock'],
        filters: [{ column: 'price', operator: 'greater_than', value: '100' }],
        conjunction: 'AND',
        created_at: '2026-01-01T00:00:00Z'
      }
    ]
  })
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false)
  const [saveNameInput, setSaveNameInput] = useState<string>('')
  const [saveDescInput, setSaveDescInput] = useState<string>('')


  // Backend API Server / Tunnel state
  const [apiUrl, setApiUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('schemapilot_api_base_url') || DEFAULT_API
    } catch {
      return DEFAULT_API
    }
  })
  const [showApiModal, setShowApiModal] = useState(false)
  const [apiModalInput, setApiModalInput] = useState(apiUrl)
  const [apiTestStatus, setApiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [apiTestMessage, setApiTestMessage] = useState('')
  const [apiGuideTab, setApiGuideTab] = useState<'tunnel' | 'vercel' | 'cloud'>('tunnel')
  const [copiedCmd, setCopiedCmd] = useState('')

  // Connection management state
  const [currentConn, setCurrentConn] = useState<ConnectionInfo | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>('mysql')
  const [dbUrlInput, setDbUrlInput] = useState('')
  const [connNickName, setConnNickName] = useState('')
  const [testing, setTesting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>(() => {
    try {
      const stored = localStorage.getItem('schemapilot_saved_connections')
      if (stored) return JSON.parse(stored)
    } catch {}
    return [
      {
        id: '1',
        name: 'Local MySQL',
        provider: 'mysql',
        url: 'mysql+pymysql://root:Jai%401432@localhost:3306/schemapilot'
      }
    ]
  })

  useEffect(() => {
    try {
      localStorage.setItem('schemapilot_saved_connections', JSON.stringify(savedConnections))
    } catch {}
  }, [savedConnections])

  function copyToClipboard(text: string, id: string) {
    void navigator.clipboard.writeText(text)
    setCopiedCmd(id)
    setTimeout(() => setCopiedCmd(''), 2000)
  }

  async function getJson<T>(path: string): Promise<T> {
    const base = apiUrl.replace(/\/+$/, '')
    const response = await fetch(`${base}${path}`)
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.detail || `Request failed (${response.status})`)
    }
    return response.json() as Promise<T>
  }

  async function postJson<T>(path: string, payload: unknown): Promise<T> {
    const base = apiUrl.replace(/\/+$/, '')
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.detail || `Request failed (${response.status})`)
    }
    return response.json() as Promise<T>
  }

  async function testApiEndpoint(urlToTest = apiModalInput) {
    setApiTestStatus('testing')
    setApiTestMessage('')
    const target = urlToTest.trim().replace(/\/+$/, '')
    if (!target) {
      setApiTestStatus('error')
      setApiTestMessage('Please enter a server URL.')
      return
    }

    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
    if (isHttps && target.startsWith('http://')) {
      setApiTestStatus('error')
      setApiTestMessage(
        'Mixed Content Restriction: This site runs on HTTPS (Vercel). Browsers block calls to insecure "http://" endpoints. Use an HTTPS tunnel (e.g. npx localtunnel --port 8000) and enter the https:// URL.'
      )
      return
    }

    try {
      const res = await fetch(`${target}/api/health`)
      if (res.ok) {
        const data = await res.json()
        setApiTestStatus('success')
        setApiTestMessage(`Connection successful! Dialect: ${data.dialect || 'connected'}`)
      } else {
        setApiTestStatus('error')
        setApiTestMessage(`Server returned status ${res.status}`)
      }
    } catch (e) {
      setApiTestStatus('error')
      setApiTestMessage(
        e instanceof Error
          ? `Could not reach backend: ${e.message}. If running locally, make sure your tunnel is active and port 8000 is running.`
          : 'Could not connect to backend server'
      )
    }
  }

  function handleSaveApiUrl(newUrl = apiModalInput) {
    const cleaned = newUrl.trim().replace(/\/+$/, '')
    if (!cleaned) return
    setApiUrl(cleaned)
    try {
      localStorage.setItem('schemapilot_api_base_url', cleaned)
    } catch {}
    setShowApiModal(false)
    setSuccessMsg(`Backend server URL set to: ${cleaned}`)
    setTimeout(() => {
      void loadInventory()
    }, 100)
  }

  async function loadCurrentConnection() {
    try {
      const data = await getJson<ConnectionInfo>('/api/connections/current')
      setCurrentConn(data)
      const matched = PROVIDERS.find(p => p.id === data.dialect || data.database_url.includes(p.id))
      if (matched) setSelectedProvider(matched.id)
    } catch {}
  }

  async function loadInventory(nextSchema = schema) {
    setStatus('loading')
    setError('')
    try {
      const [schemaData, summaryData, tableData] = await Promise.all([
        getJson<{ schemas: string[] }>('/api/schemas'),
        getJson<Summary>(`/api/summary?schema=${encodeURIComponent(nextSchema)}`),
        getJson<{ tables: TableInfo[] }>(`/api/tables?schema=${encodeURIComponent(nextSchema)}`)
      ])
      setSchemas(schemaData.schemas)
      setSummary(summaryData)
      setTables(tableData.tables)
      if (summaryData.schema && summaryData.schema !== nextSchema) {
        setSchema(summaryData.schema)
      } else if (nextSchema && nextSchema !== schema) {
        setSchema(nextSchema)
      }
      setStatus('connected')
      if (selected && !tableData.tables.some(t => t.name === selected)) {
        setSelected('')
        setDetail(null)
        setRows(null)
      } else if (!selected && tableData.tables.length > 0) {
        void openTable(tableData.tables[0].name, nextSchema)
      }
      void loadCurrentConnection()
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Could not load metadata')
    }
  }

  async function openTable(name: string, tableSchema = schema) {
    setSelected(name)
    setTab('Columns')
    setOffset(0)
    setError('')
    try {
      const [meta, data] = await Promise.all([
        getJson<Detail>(`/api/tables/${encodeURIComponent(name)}/metadata?schema=${encodeURIComponent(tableSchema)}`),
        getJson<Rows>(`/api/tables/${encodeURIComponent(name)}/rows?schema=${encodeURIComponent(tableSchema)}&limit=25&offset=0`)
      ])
      setDetail(meta)
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load table details')
    }
  }

  async function changePage(nextOffset: number) {
    if (!selected) return
    try {
      const data = await getJson<Rows>(
        `/api/tables/${encodeURIComponent(selected)}/rows?schema=${encodeURIComponent(schema)}&limit=25&offset=${nextOffset}`
      )
      setRows(data)
      setOffset(nextOffset)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load rows')
    }
  }

  async function handleTestConnection(urlToTest = dbUrlInput) {
    if (!urlToTest.trim()) {
      setError('Please provide a database link / connection URL.')
      return
    }
    setTesting(true)
    setTestResult(null)
    setError('')
    try {
      const res = await postJson<{ ok: boolean; dialect: string; database: string; message: string }>(
        '/api/connections/test',
        { database_url: urlToTest.trim() }
      )
      setTestResult({ ok: true, message: res.message || `Successfully connected to ${res.dialect}!` })
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Connection test failed' })
    } finally {
      setTesting(false)
    }
  }

  async function handleSwitchConnection(urlToSwitch = dbUrlInput, customName?: string) {
    if (!urlToSwitch.trim()) {
      setError('Please provide a database link / connection URL.')
      return
    }
    setConnecting(true)
    setError('')
    setSuccessMsg('')
    try {
      const res = await postJson<{ ok: boolean; database_url: string; dialect: string; default_schema: string; message: string }>(
        '/api/connections/switch',
        { database_url: urlToSwitch.trim() }
      )
      setSuccessMsg(res.message || 'Switched connection successfully!')
      // Save connection
      const activeName = customName || connNickName.trim() || `${selectedProvider.toUpperCase()} (${res.default_schema || 'db'})`
      setSavedConnections(prev => {
        const filtered = prev.filter(c => c.url !== urlToSwitch.trim())
        return [{ id: String(Date.now()), name: activeName, provider: selectedProvider, url: urlToSwitch.trim() }, ...filtered]
      })
      // Reload inventory for the new connection
      await loadInventory(res.default_schema)
      setTimeout(() => {
        setNav('Overview')
        setSuccessMsg(`Now connected to ${res.dialect.toUpperCase()} database.`)
      }, 700)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to switch database')
    } finally {
      setConnecting(false)
    }
  }

  function handleSelectProvider(p: ProviderPreset) {
    setSelectedProvider(p.id)
    setDbUrlInput(p.template)
    setTestResult(null)
  }

  function removeSavedConnection(id: string) {
    setSavedConnections(prev => prev.filter(c => c.id !== id))
  }

  // ─── Saved Data Selections Action Methods ───
  async function loadSavedSelections() {
    try {
      const data = await getJson<{ selections: SavedSelection[] }>('/api/saved-selections')
      if (data && Array.isArray(data.selections) && data.selections.length > 0) {
        setSavedSelections(data.selections)
        try {
          localStorage.setItem('schemapilot_saved_selections', JSON.stringify(data.selections))
        } catch {}
      }
    } catch {}
  }

  async function openSelectionTable(tableName: string) {
    setSelTable(tableName)
    setSelLoadingDetail(true)
    setSelQueryError('')
    setSelQueryResult(null)
    try {
      const meta = await getJson<Detail>(
        `/api/tables/${encodeURIComponent(tableName)}/metadata?schema=${encodeURIComponent(schema)}`
      )
      setSelTableDetail(meta)
      if (meta.schema && meta.schema !== schema) {
        setSchema(meta.schema)
        void loadInventory(meta.schema)
      }
      const cols = meta.columns.map(c => c.name)
      setSelColumns(cols.slice(0, Math.min(4, cols.length)))
      setSelFilters([])
    } catch (e) {
      setSelQueryError(e instanceof Error ? e.message : 'Could not fetch table columns')
    } finally {
      setSelLoadingDetail(false)
    }
  }

  function handleToggleColumn(colName: string) {
    setSelColumns(prev =>
      prev.includes(colName) ? prev.filter(c => c !== colName) : [...prev, colName]
    )
  }

  function handleSelectAllColumns() {
    if (!selTableDetail) return
    setSelColumns(selTableDetail.columns.map(c => c.name))
  }

  function handleClearAllColumns() {
    setSelColumns([])
  }

  function handleAddFilter() {
    if (!selTableDetail || selTableDetail.columns.length === 0) return
    const firstCol = selTableDetail.columns[0]
    const ops = getOperatorsForType(firstCol.data_type)
    const newRule: FilterRule = {
      id: String(Date.now()),
      column: firstCol.name,
      operator: ops[0]?.value || 'equals',
      value: ''
    }
    setSelFilters(prev => [...prev, newRule])
  }

  function handleUpdateFilter(id: string, field: 'column' | 'operator' | 'value', val: any) {
    setSelFilters(prev =>
      prev.map(f => {
        if (f.id !== id) return f
        if (field === 'column') {
          const colObj = selTableDetail?.columns.find(c => c.name === val)
          const newOps = getOperatorsForType(colObj?.data_type || '')
          return {
            ...f,
            column: val,
            operator: newOps[0]?.value || 'equals',
            value: ''
          }
        }
        return { ...f, [field]: val }
      })
    )
  }

  function handleRemoveFilter(id: string) {
    setSelFilters(prev => prev.filter(f => f.id !== id))
  }

  function handleClearAllFilters() {
    setSelFilters([])
  }

  async function handleExecuteQuery() {
    if (!selTable) {
      setSelQueryError('Please select a database table.')
      return
    }
    if (selColumns.length === 0) {
      setSelQueryError('Validation Error: At least one column must be selected before previewing data.')
      return
    }
    setSelQuerying(true)
    setSelQueryError('')
    try {
      const payload = {
        schema_name: schema,
        table: selTable,
        columns: selColumns,
        filters: selFilters.filter(f => f.column && f.operator).map(f => ({
          column: f.column,
          operator: f.operator,
          value: f.value
        })),
        conjunction: selConjunction,
        limit: 50,
        offset: 0
      }
      const res = await postJson<QueryResult>('/api/query', payload)
      setSelQueryResult(res)
    } catch (e) {
      setSelQueryError(e instanceof Error ? e.message : 'Query execution failed')
    } finally {
      setSelQuerying(false)
    }
  }

  async function handleLoadSelection(sel: SavedSelection) {
    setNav('Saved Data Selections')
    setSelTable(sel.table)
    setSelLoadingDetail(true)
    setSelQueryError('')
    setSelQueryResult(null)
    try {
      const targetSchema = sel.schema_name || schema || 'public'
      const meta = await getJson<Detail>(
        `/api/tables/${encodeURIComponent(sel.table)}/metadata?schema=${encodeURIComponent(targetSchema)}`
      )
      setSelTableDetail(meta)

      // Ensure active schema is synchronized to the table's actual schema
      if (meta.schema && meta.schema !== schema) {
        setSchema(meta.schema)
        void loadInventory(meta.schema)
      }

      // Reconcile columns: filter to columns that actually exist in the table
      const tableColNames = meta.columns.map(c => c.name)
      const validCols = (sel.columns || []).filter(c => tableColNames.includes(c))
      const finalCols = validCols.length > 0 ? validCols : tableColNames.slice(0, Math.min(4, tableColNames.length))
      setSelColumns(finalCols)

      // Reconcile filters
      const validFilters = (sel.filters || []).filter(f => tableColNames.includes(f.column))
      setSelFilters(validFilters.map((f, i) => ({
        id: String(Date.now() + i),
        column: f.column,
        operator: f.operator,
        value: String(f.value ?? '')
      })))
      setSelConjunction(sel.conjunction || 'AND')

      // Auto run preview query
      setSelQuerying(true)
      const qRes = await postJson<QueryResult>('/api/query', {
        schema_name: meta.schema,
        table: sel.table,
        columns: finalCols,
        filters: validFilters,
        conjunction: sel.conjunction || 'AND',
        limit: 50,
        offset: 0
      })
      setSelQueryResult(qRes)
      setSuccessMsg(`Loaded & executed: "${sel.name}" (${qRes.total_matching} records matched)`)
    } catch (e) {
      setSelQueryError(e instanceof Error ? e.message : 'Failed to load saved selection')
    } finally {
      setSelLoadingDetail(false)
      setSelQuerying(false)
    }
  }

  async function handleSaveSelection() {
    if (!saveNameInput.trim()) {
      setSelQueryError('Please provide a name for this saved selection.')
      return
    }
    if (selColumns.length === 0) {
      setSelQueryError('At least one column must be selected.')
      return
    }
    const targetSchema = selTableDetail?.schema || schema || 'public'
    const newEntry: SavedSelection = {
      id: String(Date.now()),
      name: saveNameInput.trim(),
      description: saveDescInput.trim(),
      schema_name: targetSchema,
      table: selTable,
      columns: selColumns,
      filters: selFilters.map(f => ({ column: f.column, operator: f.operator, value: f.value })),
      conjunction: selConjunction,
      created_at: new Date().toISOString()
    }

    try {
      await postJson('/api/saved-selections', newEntry).catch(() => {})
    } catch {}

    setSavedSelections(prev => {
      const updated = [newEntry, ...prev.filter(x => x.name !== newEntry.name)]
      try {
        localStorage.setItem('schemapilot_saved_selections', JSON.stringify(updated))
      } catch {}
      return updated
    })
    setShowSaveModal(false)
    setSaveNameInput('')
    setSaveDescInput('')
    setSuccessMsg(`Selection "${newEntry.name}" saved successfully!`)
  }


  async function handleDeleteSavedSelection(id: string) {
    try {
      await fetch(`${apiUrl.replace(/\/+$/, '')}/api/saved-selections/${id}`, { method: 'DELETE' }).catch(() => {})
    } catch {}
    setSavedSelections(prev => {
      const updated = prev.filter(s => s.id !== id)
      try {
        localStorage.setItem('schemapilot_saved_selections', JSON.stringify(updated))
      } catch {}
      return updated
    })
  }

  useEffect(() => {
    void loadInventory('public')
    void loadSavedSelections()
  }, [])


  const filtered = useMemo(
    () => tables.filter(t => t.name.toLowerCase().includes(search.toLowerCase())),
    [tables, search]
  )

  const activeProvider = useMemo(
    () => PROVIDERS.find(p => p.id === selectedProvider) || PROVIDERS[0],
    [selectedProvider]
  )

  function exportMetadata() {
    const payload = JSON.stringify({ schema, summary, tables, selected_table: detail }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `schemapilot-${schema}-metadata.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleNavClick(target: typeof nav) {
    setNav(target)
    setSidebarOpen(false)
  }

  return (
    <div className="app-shell">
      {/* Mobile sidebar overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* ─── Sidebar ─── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} role="navigation" aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Database size={18} />
          </div>
          <div className="brand-text">
            <div className="brand-title-row">
              <strong>SchemaPilot</strong>
              <span className="brand-badge">ENTERPRISE</span>
            </div>
            <span>Database Intelligence</span>
          </div>
        </div>

        <div className="nav-label">Workspace</div>
        <button className={`nav-item ${nav === 'Overview' ? 'active' : ''}`} onClick={() => handleNavClick('Overview')}>
          <LayoutDashboard size={16} /> Overview
        </button>
        <button
          className={`nav-item ${nav === 'Saved Data Selections' ? 'active' : ''}`}
          onClick={() => {
            handleNavClick('Saved Data Selections')
            if (!selTableDetail && tables.length > 0) {
              void openSelectionTable(selTable || tables[0].name)
            }
          }}
        >
          <Bookmark size={16} /> Saved Data Selections <span className="nav-count">{savedSelections.length}</span>
        </button>
        <button className={`nav-item ${nav === 'Connections' ? 'active' : ''}`} onClick={() => handleNavClick('Connections')}>
          <Database size={16} /> Connections <span className="nav-count">{savedConnections.length}</span>
        </button>
        <button className={`nav-item ${nav === 'Schemas' ? 'active' : ''}`} onClick={() => handleNavClick('Schemas')}>
          <Boxes size={16} /> Schemas <span className="nav-count">{schemas.length}</span>
        </button>
        <button className={`nav-item ${nav === 'Tables' ? 'active' : ''}`} onClick={() => handleNavClick('Tables')}>
          <Table2 size={16} /> Tables <span className="nav-count">{tables.length}</span>
        </button>
        <button className={`nav-item ${nav === 'Relationships' ? 'active' : ''}`} onClick={() => handleNavClick('Relationships')}>
          <GitBranch size={16} /> Relationships
        </button>

        <div className="sidebar-bottom">
          <div className="secure-icon" aria-hidden="true">
            <ShieldCheck size={16} />
          </div>
          <div>
            <strong>Read-only explorer</strong>
            <span>Metadata & row preview</span>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(v => !v)}
              aria-label="Toggle navigation menu"
            >
              <Menu size={18} />
            </button>
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={13} />
              <b>{nav}</b>
              {selected && nav === 'Overview' && (
                <>
                  <ChevronRight size={13} />
                  <b>{selected}</b>
                </>
              )}
            </nav>
          </div>
          <div className="top-actions">
            <button
              className="api-endpoint-badge"
              onClick={() => {
                setApiModalInput(apiUrl)
                setShowApiModal(true)
              }}
              title="Click to view/change backend API server URL or configure Vercel tunnel"
              aria-label="Configure backend API server endpoint"
            >
              <Server size={12} />
              <span className="api-endpoint-text">
                {apiUrl.replace(/^https?:\/\//, '')}
              </span>
              <Settings size={11} style={{ opacity: 0.7 }} />
            </button>
            <span className={`status-dot ${status}`} aria-label={`Connection status: ${status}`} />
            <span>
              {status === 'connected'
                ? `Connected · ${currentConn?.dialect?.toUpperCase() || 'DB'}`
                : status === 'loading'
                ? 'Connecting…'
                : 'Connection error'}
            </span>
            <button
              className="icon-button"
              onClick={() => void loadInventory()}
              title="Refresh metadata"
              aria-label="Refresh metadata"
            >
              <RefreshCw size={15} />
            </button>
            <button
              className="icon-button theme-toggle-btn"
              onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
            </button>
          </div>
        </header>

        <section className="content">
          {/* ─── Global Alerts ─── */}
          {error && (
            <div className="error-banner" role="alert">
              <CircleHelp size={16} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div>{error}</div>
                {(status === 'error' || error.toLowerCase().includes('failed to fetch') || error.toLowerCase().includes('network')) && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="button small primary"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                      onClick={() => {
                        setApiModalInput(apiUrl)
                        setShowApiModal(true)
                      }}
                    >
                      <Server size={12} /> Configure Backend Server / Tunnel
                    </button>
                    <span style={{ fontSize: 11, opacity: 0.85 }}>
                      Deploying to Vercel? Forward your local port 8000 via a free HTTPS tunnel (e.g. <code>npx localtunnel --port 8000</code>).
                    </span>
                  </div>
                )}
                {error.includes('supabase.co') && (error.includes('timed out') || error.includes('10060')) && (
                  <div style={{ marginTop: 8, fontSize: 12, padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 6, border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                    <strong>IPv6 Timeout Detected:</strong> Supabase direct host (<code>db.*.supabase.co</code>) only supports IPv6, which is not routed by your network.
                    <br />
                    <strong>Fix:</strong> In your Supabase dashboard, go to <strong>Project Settings → Database → Connection string</strong>, select <strong>Connection pooler</strong> (port 6543 or 5432 with <code>pooler.supabase.com</code>) which supports IPv4.
                  </div>
                )}
              </div>
              <button onClick={() => setError('')} aria-label="Dismiss error">
                <X size={14} />
              </button>
            </div>
          )}
          {successMsg && (
            <div className="success-banner" role="status">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
              <button onClick={() => setSuccessMsg('')} style={{ background: 'transparent', border: 0, color: 'inherit' }} aria-label="Dismiss success message">
                <X size={14} />
              </button>
            </div>
          )}

          {/* ════════════════════════════════════════
              VIEW: SAVED DATA SELECTIONS STUDIO
              ════════════════════════════════════════ */}
          {nav === 'Saved Data Selections' && (
            <div className="selections-studio">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">Database Intelligence & Extraction</div>
                  <h1>Saved Data Selections</h1>
                  <p>
                    Dynamically discover database tables, select custom column projections, build type-aware parameterized filters, live preview records, and export to Excel / CSV.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="button primary"
                    onClick={() => void handleExecuteQuery()}
                    disabled={selQuerying || selColumns.length === 0}
                  >
                    {selQuerying ? (
                      <>
                        <RefreshCw size={13} className="spinning" /> Querying…
                      </>
                    ) : (
                      <>
                        <Play size={13} /> Preview Data
                      </>
                    )}
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setSaveNameInput(selTable ? `${selTable.toUpperCase()} Selection` : '')
                      setShowSaveModal(true)
                    }}
                    disabled={!selTable || selColumns.length === 0}
                  >
                    <Bookmark size={13} /> Save Selection
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => exportToExcelCSV(selTable, selColumns, selQueryResult?.rows || [])}
                    disabled={!selQueryResult || selQueryResult.rows.length === 0}
                    title="Download comma-separated values file (opens in Microsoft Excel)"
                  >
                    <FileSpreadsheet size={13} /> Export Excel (.csv)
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => exportToExcelXLS(selTable, selColumns, selQueryResult?.rows || [])}
                    disabled={!selQueryResult || selQueryResult.rows.length === 0}
                    title="Download formatted Excel HTML spreadsheet"
                  >
                    <Download size={13} /> Export Excel (.xls)
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => exportSelectionJSON(selTable, selColumns, selQueryResult?.rows || [])}
                    disabled={!selQueryResult || selQueryResult.rows.length === 0}
                    title="Download raw JSON projection"
                  >
                    <Download size={13} /> Export JSON
                  </button>
                </div>
              </div>

              {/* Active Connection Bar */}
              <div className="connection-bar">
                <div className="connection-icon">
                  <Database size={18} />
                </div>
                <div className="connection-info">
                  <span>Schema Selection</span>
                  <strong>
                    {currentConn?.dialect ? currentConn.dialect.toUpperCase() : 'Database'} · Schema: {schema}
                  </strong>
                </div>
                <div className="schema-picker">
                  <label htmlFor="studio-schema">Schema</label>
                  <select
                    id="studio-schema"
                    value={schema}
                    onChange={e => {
                      setSchema(e.target.value)
                      void loadInventory(e.target.value)
                      setSelTableDetail(null)
                      setSelQueryResult(null)
                    }}
                  >
                    {schemas.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="live-badge">
                  <span /> DYNAMIC INSPECTOR
                </div>
              </div>

              {selQueryError && (
                <div className="error-banner" role="alert">
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>{selQueryError}</span>
                  <button onClick={() => setSelQueryError('')} aria-label="Dismiss error">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* ─── Studio Main 2-Column Grid ─── */}
              <div className="studio-grid">
                {/* ─── LEFT COLUMN: Dynamic Table Discovery + Saved Configurations ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
                  {/* Step 1: Automatic Table Discovery */}
                  <div className="studio-card">
                    <div className="studio-card-header">
                      <div className="studio-card-title">
                        <div className="step-num-badge">1</div>
                        <div>
                          <h3>Select Table</h3>
                          <p>{tables.length} tables discovered in schema "{schema}"</p>
                        </div>
                      </div>
                      <span className="count-pill">{tables.length}</span>
                    </div>

                    <div className="search-box" style={{ margin: 0 }}>
                      <Search size={14} />
                      <input
                        placeholder="Search discovered tables…"
                        value={selTableSearch}
                        onChange={e => setSelTableSearch(e.target.value)}
                        aria-label="Search discovered tables"
                      />
                    </div>

                    <div className="table-picker-scroll">
                      {tables
                        .filter(t => t.name.toLowerCase().includes(selTableSearch.toLowerCase()))
                        .map(t => {
                          const isActive = selTable === t.name
                          return (
                            <button
                              key={t.name}
                              className={`table-picker-item ${isActive ? 'active' : ''}`}
                              onClick={() => void openSelectionTable(t.name)}
                              aria-label={`Select table ${t.name}`}
                            >
                              <div className="table-picker-info">
                                <strong>{t.name}</strong>
                                <span>
                                  {t.column_count} cols · {t.primary_key_constraint_count} PK · {t.foreign_key_constraint_count} FK
                                </span>
                              </div>
                              <ChevronRight size={14} style={{ opacity: isActive ? 1 : 0.4 }} />
                            </button>
                          )
                        })}
                      {tables.filter(t => t.name.toLowerCase().includes(selTableSearch.toLowerCase())).length === 0 && (
                        <div className="empty">No matching tables found.</div>
                      )}
                    </div>
                  </div>

                  {/* Saved Selections / Presets */}
                  <div className="studio-card">
                    <div className="studio-card-header">
                      <div className="studio-card-title">
                        <Bookmark size={16} style={{ color: 'var(--accent)' }} />
                        <div>
                          <h3>Saved Configurations</h3>
                          <p>{savedSelections.length} saved selection(s)</p>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {savedSelections.map(sel => (
                        <div key={sel.id} className="saved-preset-card">
                          <div className="saved-preset-header">
                            <div className="saved-preset-title">
                              <strong>{sel.name}</strong>
                              <span>
                                Table: <code>{sel.table}</code> ({sel.columns.length} cols)
                              </span>
                            </div>
                            <span className="pill primary" style={{ fontSize: 9 }}>
                              {sel.conjunction || 'AND'}
                            </span>
                          </div>

                          {sel.description && (
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{sel.description}</div>
                          )}

                          <div className="saved-preset-meta">
                            <div>
                              <strong>Columns:</strong> {sel.columns.join(', ')}
                            </div>
                            {sel.filters && sel.filters.length > 0 && (
                              <div>
                                <strong>Filters ({sel.filters.length}):</strong>{' '}
                                {sel.filters.map(f => `${f.column} ${f.operator} "${f.value || ''}"`).join(` ${sel.conjunction} `)}
                              </div>
                            )}
                          </div>

                          <div className="saved-preset-actions">
                            <button
                              className="button small primary"
                              onClick={() => void handleLoadSelection(sel)}
                              disabled={selLoadingDetail || selQuerying}
                            >
                              <Play size={11} /> Load & Run
                            </button>
                            <button
                              className="button small secondary"
                              onClick={() => void handleDeleteSavedSelection(sel.id)}
                              title="Delete saved configuration"
                              aria-label={`Delete configuration ${sel.name}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ─── RIGHT COLUMN: Column Selection + Filters + Data Preview ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
                  {/* Step 2: Column Selection */}
                  <div className="studio-card">
                    <div className="studio-card-header">
                      <div className="studio-card-title">
                        <div className="step-num-badge">2</div>
                        <div>
                          <h3>
                            Column Selection · <code style={{ color: 'var(--accent)' }}>{selTable}</code>
                          </h3>
                          <p>
                            Select columns with checkboxes. The preview and Excel export will contain ONLY selected columns.
                          </p>
                        </div>
                      </div>
                      <span className="count-pill">
                        {selColumns.length} / {selTableDetail?.columns.length || 0} Selected
                      </span>
                    </div>

                    {/* Column Toolbar */}
                    <div className="columns-toolbar">
                      <input
                        className="column-search-input"
                        placeholder="Search columns…"
                        value={selColSearch}
                        onChange={e => setSelColSearch(e.target.value)}
                        aria-label="Search columns"
                      />
                      <div className="columns-quick-actions">
                        <button
                          type="button"
                          className="button small secondary"
                          onClick={handleSelectAllColumns}
                          disabled={!selTableDetail}
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          className="button small secondary"
                          onClick={handleClearAllColumns}
                          disabled={!selTableDetail || selColumns.length === 0}
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    {/* Validation Warning */}
                    {selColumns.length === 0 ? (
                      <div className="error-banner" style={{ margin: 0 }}>
                        <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                        <span>At least one column must be selected before saving, previewing, or exporting data.</span>
                      </div>
                    ) : (
                      <div className="active-projection-pills">
                        <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>Active Projection ({selColumns.length}):</span>
                        {selColumns.map(c => (
                          <span key={c} className="projection-pill">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Column Checkbox Grid */}
                    {selLoadingDetail ? (
                      <div className="empty">
                        <RefreshCw size={16} className="spinning" /> Loading table columns…
                      </div>
                    ) : (
                      <div className="column-checkbox-grid">
                        {(selTableDetail?.columns || [])
                          .filter(c => c.name.toLowerCase().includes(selColSearch.toLowerCase()))
                          .map(c => {
                            const isChecked = selColumns.includes(c.name)
                            return (
                              <label
                                key={c.name}
                                className={`column-checkbox-card ${isChecked ? 'checked' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleColumn(c.name)}
                                />
                                <div className="column-meta-wrap">
                                  <strong>{c.name}</strong>
                                  <span>{c.data_type}</span>
                                </div>
                                <div className="tag-list" style={{ marginLeft: 'auto' }}>
                                  {c.primary_key && <span className="pill primary">PK</span>}
                                  {c.foreign_key && <span className="pill foreign">FK</span>}
                                  {c.unique && <span className="pill unique">UQ</span>}
                                </div>
                              </label>
                            )
                          })}
                        {(selTableDetail?.columns || []).filter(c =>
                          c.name.toLowerCase().includes(selColSearch.toLowerCase())
                        ).length === 0 && (
                          <div className="empty" style={{ gridColumn: '1 / -1' }}>
                            No columns matching "{selColSearch}".
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Step 3: Row Selection & Filtering */}
                  <div className="studio-card">
                    <div className="studio-card-header">
                      <div className="studio-card-title">
                        <div className="step-num-badge">3</div>
                        <div>
                          <h3>Row Selection & Filtering</h3>
                          <p>
                            Type-aware parameterized filters. Identifiers and values are sanitized and passed as bind parameters.
                          </p>
                        </div>
                      </div>
                      <span className="count-pill">{selFilters.length} Filter(s)</span>
                    </div>

                    {/* Filter Conjunction Bar */}
                    <div className="filter-conjunction-bar">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Logic:</span>
                        <div className="conjunction-toggle">
                          <button
                            type="button"
                            className={`conjunction-btn ${selConjunction === 'AND' ? 'active' : ''}`}
                            onClick={() => setSelConjunction('AND')}
                          >
                            Match ALL (AND)
                          </button>
                          <button
                            type="button"
                            className={`conjunction-btn ${selConjunction === 'OR' ? 'active' : ''}`}
                            onClick={() => setSelConjunction('OR')}
                          >
                            Match ANY (OR)
                          </button>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {selConjunction === 'AND'
                            ? '• Records must satisfy all specified filter rules'
                            : '• Records matching any filter rule will be returned'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="button small primary"
                          onClick={handleAddFilter}
                          disabled={!selTableDetail || selTableDetail.columns.length === 0}
                        >
                          <Plus size={12} /> Add Filter Rule
                        </button>
                        {selFilters.length > 0 && (
                          <button
                            type="button"
                            className="button small secondary"
                            onClick={handleClearAllFilters}
                          >
                            Clear All
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Filter Rules List */}
                    {selFilters.length === 0 ? (
                      <div className="filter-empty-state">
                        No filters applied. All rows from <code>{selTable}</code> will be included in the selection. Click{' '}
                        <strong>"+ Add Filter Rule"</strong> to filter by specific column values.
                      </div>
                    ) : (
                      <div className="filter-rule-list">
                        {selFilters.map(f => {
                          const colMeta = selTableDetail?.columns.find(c => c.name === f.column)
                          const availableOps = getOperatorsForType(colMeta?.data_type || '')
                          const isNoValueOp = f.operator === 'is_empty' || f.operator === 'is_not_empty'
                          return (
                            <div key={f.id} className="filter-rule-item">
                              {/* Column dropdown */}
                              <select
                                className="filter-select"
                                value={f.column}
                                onChange={e => handleUpdateFilter(f.id, 'column', e.target.value)}
                              >
                                {(selTableDetail?.columns || []).map(col => (
                                  <option key={col.name} value={col.name}>
                                    {col.name} ({col.data_type})
                                  </option>
                                ))}
                              </select>

                              {/* Type-appropriate operator dropdown */}
                              <select
                                className="filter-select"
                                value={f.operator}
                                onChange={e => handleUpdateFilter(f.id, 'operator', e.target.value)}
                              >
                                {availableOps.map(op => (
                                  <option key={op.value} value={op.value}>
                                    {op.label}
                                  </option>
                                ))}
                              </select>

                              {/* Parameterized Value Input */}
                              <input
                                className="filter-input"
                                placeholder={isNoValueOp ? 'No value needed (checks NULL/blank)' : `Value for ${f.column}…`}
                                value={f.value}
                                disabled={isNoValueOp}
                                onChange={e => handleUpdateFilter(f.id, 'value', e.target.value)}
                              />

                              {/* Remove rule button */}
                              <button
                                type="button"
                                className="icon-button"
                                style={{ width: 28, height: 28 }}
                                onClick={() => handleRemoveFilter(f.id)}
                                title="Delete filter rule"
                                aria-label="Delete filter rule"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Step 4: Data Preview */}
                  <div className="studio-card highlight">
                    <div className="studio-card-header">
                      <div className="studio-card-title">
                        <div className="step-num-badge">4</div>
                        <div>
                          <h3>Data Preview</h3>
                          <p>
                            {selQueryResult
                              ? `Previewing ${selQueryResult.rows.length} of ${selQueryResult.total_matching} matching record(s) with ${selQueryResult.columns.length} selected column(s)`
                              : 'Click "Preview Data" to run the parameterized query against Supabase.'}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="button primary small"
                          onClick={() => void handleExecuteQuery()}
                          disabled={selQuerying || selColumns.length === 0}
                        >
                          {selQuerying ? (
                            <>
                              <RefreshCw size={12} className="spinning" /> Loading…
                            </>
                          ) : (
                            <>
                              <Play size={12} /> Preview Data
                            </>
                          )}
                        </button>
                        {selQueryResult && selQueryResult.rows.length > 0 && (
                          <button
                            className="button secondary small"
                            onClick={() => exportToExcelCSV(selTable, selColumns, selQueryResult.rows)}
                            title="Export to CSV / Excel"
                          >
                            <FileSpreadsheet size={12} /> Excel CSV
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Preview Table */}
                    {selQuerying ? (
                      <div className="empty" style={{ padding: 40 }}>
                        <RefreshCw size={24} className="spinning" style={{ color: 'var(--accent)' }} />
                        <div style={{ marginTop: 12, fontWeight: 600 }}>Executing parameterized query…</div>
                      </div>
                    ) : !selQueryResult ? (
                      <div className="detail-empty" style={{ padding: 32 }}>
                        <div className="empty-icon">
                          <Table2 size={24} />
                        </div>
                        <h2>No preview generated yet</h2>
                        <p>
                          Configure your desired columns and optional filters above, then click <strong>"Preview Data"</strong>.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="data-note" style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>
                            Table: <code>{selQueryResult.table}</code> · Total matched in database:{' '}
                            <strong>{selQueryResult.total_matching} rows</strong>
                          </span>
                          <span>Columns: {selQueryResult.columns.join(', ')}</span>
                        </div>

                        <div className="data-table-wrap">
                          <table>
                            <thead>
                              <tr>
                                {selQueryResult.columns.map(c => (
                                  <th key={c}>
                                    <span style={{ fontFamily: 'var(--font-mono)' }}>{c}</span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {selQueryResult.rows.map((row, idx) => (
                                <tr key={idx}>
                                  {selQueryResult.columns.map(col => {
                                    const val = row[col]
                                    return (
                                      <td key={col}>
                                        {val === null || val === undefined ? (
                                          <em style={{ color: 'var(--text-muted)' }}>NULL</em>
                                        ) : typeof val === 'boolean' ? (
                                          <span className={val ? 'pill primary' : 'pill neutral'}>
                                            {val ? 'TRUE' : 'FALSE'}
                                          </span>
                                        ) : (
                                          String(val)
                                        )}
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))}
                              {selQueryResult.rows.length === 0 && (
                                <tr>
                                  <td
                                    colSpan={selQueryResult.columns.length || 1}
                                    style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}
                                  >
                                    No records matched your filter criteria in schema '{schema}'.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ─── Save Configuration Modal ─── */}
              {showSaveModal && (
                <div className="api-modal-backdrop" onClick={() => setShowSaveModal(false)}>
                  <div
                    className="api-modal"
                    onClick={e => e.stopPropagation()}
                    role="dialog"
                    aria-labelledby="save-modal-title"
                  >
                    <div className="api-modal-header">
                      <div className="api-modal-title">
                        <div className="provider-icon" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
                          <Bookmark size={18} />
                        </div>
                        <div>
                          <h3 id="save-modal-title">Save Data Selection</h3>
                          <p>Save this table, column projection, and filter configuration for instant reuse.</p>
                        </div>
                      </div>
                      <button className="icon-button" onClick={() => setShowSaveModal(false)} aria-label="Close modal">
                        <X size={16} />
                      </button>
                    </div>

                    <div className="api-modal-body">
                      <div className="conn-field">
                        <label>
                          <span>Selection Name</span>
                        </label>
                        <input
                          className="conn-input"
                          placeholder="e.g. Completed Orders with Customer Emails"
                          value={saveNameInput}
                          onChange={e => setSaveNameInput(e.target.value)}
                          autoFocus
                        />
                      </div>

                      <div className="conn-field">
                        <label>
                          <span>Description (Optional)</span>
                        </label>
                        <input
                          className="conn-input"
                          placeholder="e.g. Filters high-value customer orders"
                          value={saveDescInput}
                          onChange={e => setSaveDescInput(e.target.value)}
                        />
                      </div>

                      <div
                        style={{
                          background: 'var(--bg-surface-0)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          padding: 12,
                          fontSize: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }}
                      >
                        <div>
                          <strong>Table:</strong> <code>{selTable}</code> (Schema: {schema})
                        </div>
                        <div>
                          <strong>Selected Columns ({selColumns.length}):</strong> {selColumns.join(', ')}
                        </div>
                        <div>
                          <strong>Filters ({selFilters.length}):</strong>{' '}
                          {selFilters.length === 0
                            ? 'None (all rows)'
                            : selFilters.map(f => `${f.column} ${f.operator} "${f.value}"`).join(` ${selConjunction} `)}
                        </div>
                      </div>
                    </div>

                    <div className="api-modal-footer">
                      <button className="button secondary" onClick={() => setShowSaveModal(false)}>
                        Cancel
                      </button>
                      <button
                        className="button primary"
                        onClick={() => void handleSaveSelection()}
                        disabled={!saveNameInput.trim()}
                      >
                        <Check size={14} /> Save Configuration
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════
              VIEW: CONNECTIONS MANAGER
              ════════════════════════════════════════ */}
          {nav === 'Connections' && (
            <div>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">Database Connectivity</div>
                  <h1>Database Connections</h1>
                  <p>Connect and switch between MySQL, PostgreSQL, Supabase, Oracle, Microsoft SQL Server, or SQLite.</p>
                </div>
                <button className="button secondary" onClick={() => setNav('Overview')}>
                  <LayoutDashboard size={14} /> Back to Overview
                </button>
              </div>

              {/* Active Connection Info Card */}
              <div className="conn-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="connection-icon">
                      <Server size={18} />
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '1.5px', fontWeight: 600, textTransform: 'uppercase' as const }}>Current Active Database</span>
                      <h3 style={{ margin: '4px 0 0', color: 'var(--text-primary)', fontSize: 15, textTransform: 'uppercase' as const, fontWeight: 700 }}>
                        {currentConn?.dialect || 'Connected Engine'} · {schema}
                      </h3>
                    </div>
                  </div>
                  <div className="live-badge">
                    <span /> LIVE
                  </div>
                </div>

                <div className="active-conn-summary">
                  <div className="active-conn-item">
                    <span>Database Engine</span>
                    <strong>{currentConn?.dialect?.toUpperCase() || '—'}</strong>
                  </div>
                  <div className="active-conn-item">
                    <span>Target Database / Schema</span>
                    <strong>{currentConn?.database || schema || '—'}</strong>
                  </div>
                  <div className="active-conn-item">
                    <span>Host / Endpoint</span>
                    <strong>{currentConn?.host || 'localhost'}</strong>
                  </div>
                  <div className="active-conn-item">
                    <span>Connection URI (Masked)</span>
                    <strong>{currentConn?.database_url || '—'}</strong>
                  </div>
                </div>
              </div>

              {/* Connect / Change Database Form */}
              <div className="conn-card">
                <h3 style={{ margin: '0 0 6px', fontSize: 15, color: 'var(--text-primary)', fontWeight: 700 }}>Connect to a Database</h3>
                <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                  Select your database type or paste any valid SQLAlchemy database connection link.
                </p>

                {/* Database Provider Selectors */}
                <div className="provider-grid">
                  {PROVIDERS.map(p => (
                    <button
                      key={p.id}
                      className={`provider-btn ${selectedProvider === p.id ? 'selected' : ''}`}
                      onClick={() => handleSelectProvider(p)}
                    >
                      <div className="provider-header">
                        <span className="provider-name">{p.name}</span>
                        <span className="provider-tag">{p.tag}</span>
                      </div>
                      <span className="provider-driver">{p.driver}</span>
                    </button>
                  ))}
                </div>

                {/* Connection Form Fields */}
                <div className="conn-field">
                  <label>
                    Connection Name / Label (Optional)
                    <span>e.g., Production Supabase, Local MySQL</span>
                  </label>
                  <input
                    className="conn-input"
                    placeholder={`e.g. My ${activeProvider.name} Database`}
                    value={connNickName}
                    onChange={e => setConnNickName(e.target.value)}
                  />
                </div>

                <div className="conn-field">
                  <label>
                    <span>Database Link / Connection URL</span>
                    <button
                      type="button"
                      onClick={() => setDbUrlInput(activeProvider.template)}
                      style={{ background: 'transparent', border: 0, color: 'var(--accent)', fontSize: 11, cursor: 'pointer', fontWeight: 500 }}
                    >
                      Reset to {activeProvider.name} Example
                    </button>
                  </label>
                  <input
                    className="conn-input"
                    placeholder={activeProvider.template}
                    value={dbUrlInput}
                    onChange={e => {
                      setDbUrlInput(e.target.value)
                      setTestResult(null)
                    }}
                  />
                  <div className="conn-tip">
                    <strong>Tip for {activeProvider.name}:</strong> {activeProvider.tip}
                  </div>
                </div>

                {/* Test Feedback */}
                {testResult && (
                  <div className={testResult.ok ? 'success-banner' : 'error-banner'} style={{ marginTop: 14 }}>
                    {testResult.ok ? <CheckCircle2 size={15} /> : <CircleHelp size={15} />}
                    <span>{testResult.message}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="conn-actions">
                  <button
                    className="button secondary"
                    onClick={() => handleTestConnection()}
                    disabled={testing || connecting || !dbUrlInput.trim()}
                  >
                    <Plug size={14} /> {testing ? 'Testing Connection…' : 'Test Connection'}
                  </button>
                  <button
                    className="button primary"
                    onClick={() => handleSwitchConnection()}
                    disabled={testing || connecting || !dbUrlInput.trim()}
                  >
                    <Database size={14} /> {connecting ? 'Connecting…' : 'Apply & Connect Database'}
                  </button>
                </div>
              </div>

              {/* Saved Connections Table */}
              <div className="conn-card">
                <h3 style={{ margin: '0 0 6px', fontSize: 15, color: 'var(--text-primary)', fontWeight: 700 }}>Saved Connections</h3>
                <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                  Quickly switch between databases you have connected to.
                </p>

                {savedConnections.length === 0 ? (
                  <div className="empty">No saved connections yet. Connect to a database above to save it here.</div>
                ) : (
                  <div className="data-table-wrap">
                    <table className="saved-table">
                      <thead>
                        <tr>
                          <th>Connection Name</th>
                          <th>Provider</th>
                          <th>Connection URL</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {savedConnections.map(c => {
                          const isCurrent = currentConn?.database_url && c.url.includes(currentConn.database)
                          return (
                            <tr key={c.id}>
                              <td>
                                <strong>{c.name}</strong>
                                {isCurrent && (
                                  <span className="pill unique" style={{ marginLeft: 8 }}>
                                    ACTIVE
                                  </span>
                                )}
                              </td>
                              <td>
                                <span className="pill foreign">{c.provider.toUpperCase()}</span>
                              </td>
                              <td>
                                <code>{c.url.replace(/:([^@]+)@/, ':******@')}</code>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: 6 }}>
                                  <button
                                    className="button small primary"
                                    onClick={() => handleSwitchConnection(c.url, c.name)}
                                    disabled={connecting}
                                  >
                                    Connect
                                  </button>
                                  <button
                                    className="button small secondary"
                                    onClick={() => removeSavedConnection(c.id)}
                                    title="Delete saved connection"
                                    aria-label={`Delete ${c.name}`}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
              VIEW: SCHEMAS
              ════════════════════════════════════════ */}
          {nav === 'Schemas' && (
            <div>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">Database Structure</div>
                  <h1>Database Schemas</h1>
                  <p>All available schemas reported by {currentConn?.dialect?.toUpperCase() || 'the database engine'}.</p>
                </div>
                <button className="button secondary" onClick={() => setNav('Overview')}>
                  <LayoutDashboard size={14} /> Back to Overview
                </button>
              </div>

              <div className="provider-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                {schemas.map(s => (
                  <div
                    key={s}
                    className={`provider-btn ${schema === s ? 'selected' : ''}`}
                    onClick={() => {
                      setSchema(s)
                      setSelected('')
                      setDetail(null)
                      setRows(null)
                      void loadInventory(s)
                      setNav('Overview')
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSchema(s)
                        setSelected('')
                        setDetail(null)
                        setRows(null)
                        void loadInventory(s)
                        setNav('Overview')
                      }
                    }}
                  >
                    <div className="provider-header">
                      <strong style={{ fontSize: 14 }}>{s}</strong>
                      {schema === s && <span className="pill unique">ACTIVE</span>}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Click to explore schema tables</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
              VIEW: RELATIONSHIPS
              ════════════════════════════════════════ */}
          {nav === 'Relationships' && (
            <div>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">Data Model Intelligence</div>
                  <h1>Foreign Key Relationships</h1>
                  <p>Entity relationships detected in schema <b>{schema}</b>.</p>
                </div>
                <button className="button secondary" onClick={() => setNav('Overview')}>
                  <LayoutDashboard size={14} /> Back to Overview
                </button>
              </div>

              <div className="conn-card">
                <div className="data-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Source Table</th>
                        <th>Foreign Key Column(s)</th>
                        <th>Target Table</th>
                        <th>Target Column(s)</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tables.filter(t => t.foreign_key_constraint_count > 0).length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                            No foreign key constraints defined in schema '{schema}'.
                          </td>
                        </tr>
                      ) : (
                        tables
                          .filter(t => t.foreign_key_constraint_count > 0)
                          .map(t => (
                            <tr key={t.name}>
                              <td>
                                <strong>{t.name}</strong>
                              </td>
                              <td>
                                <span className="pill foreign">{t.foreign_key_constraint_count} FK constraint(s)</span>
                              </td>
                              <td>Relational Model</td>
                              <td>Primary Key</td>
                              <td>
                                <button
                                  className="button small secondary"
                                  onClick={() => {
                                    setNav('Overview')
                                    void openTable(t.name)
                                  }}
                                >
                                  Inspect Details <ExternalLink size={11} />
                                </button>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
              VIEW: OVERVIEW / TABLES (METADATA EXPLORER)
              ════════════════════════════════════════ */}
          {(nav === 'Overview' || nav === 'Tables') && (
            <div>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">Database Intelligence</div>
                  <h1>Metadata Explorer</h1>
                  <p>Discover tables, keys, indexes, constraints and relationships across your database.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="button secondary" onClick={() => setNav('Connections')}>
                    <Plug size={14} /> Switch Database
                  </button>
                  <button className="button secondary" onClick={exportMetadata}>
                    <Download size={14} /> Export JSON
                  </button>
                </div>
              </div>

              {/* Active Connection Bar */}
              <div className="connection-bar">
                <div className="connection-icon">
                  <Database size={18} />
                </div>
                <div className="connection-info">
                  <span>Active Connection</span>
                  <strong>
                    {currentConn?.dialect ? currentConn.dialect.toUpperCase() : 'Database'} · {schema}
                  </strong>
                </div>
                <div className="schema-picker">
                  <label htmlFor="schema">Schema</label>
                  <select
                    id="schema"
                    value={schema}
                    onChange={e => {
                      setSchema(e.target.value)
                      setSelected('')
                      setDetail(null)
                      setRows(null)
                      void loadInventory(e.target.value)
                    }}
                  >
                    {schemas.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="button secondary small"
                  onClick={() => setNav('Connections')}
                  style={{ marginLeft: 8 }}
                  title="Switch or configure database"
                >
                  <Plug size={12} /> Change
                </button>
                <div className="live-badge">
                  <span /> LIVE METADATA
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="metrics-grid">
                <Metric icon={<Table2 />} label="Total tables" value={summary?.table_count} tone="blue" />
                <Metric icon={<Boxes />} label="Total columns" value={summary?.column_count} tone="violet" />
                <Metric icon={<KeyRound />} label="Primary keys" value={summary?.primary_key_constraint_count} tone="amber" />
                <Metric icon={<GitBranch />} label="Foreign keys" value={summary?.foreign_key_constraint_count} tone="green" />
                <Metric icon={<Activity />} label="Indexes" value={summary?.index_count} tone="cyan" />
              </div>

              {/* Workspace: Table List + Detail Panel */}
              <div className="workspace-grid">
                <section className="panel inventory" aria-label="Table inventory">
                  <div className="panel-header">
                    <div>
                      <h2>Table Inventory</h2>
                      <p>
                        {tables.length} tables in <b>{schema}</b>
                      </p>
                    </div>
                    <span className="count-pill">{filtered.length}</span>
                  </div>
                  <div className="search-box">
                    <Search size={15} />
                    <input
                      placeholder="Search tables…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      aria-label="Search tables"
                    />
                  </div>
                  <div className="table-list">
                    {filtered.map(t => (
                      <button
                        key={t.name}
                        className={`table-row ${selected === t.name ? 'selected' : ''}`}
                        onClick={() => void openTable(t.name)}
                        aria-label={`Inspect table ${t.name}`}
                      >
                        <div className="table-symbol" aria-hidden="true">
                          <Table2 size={15} />
                        </div>
                        <div className="table-name">
                          <strong>{t.name}</strong>
                          <span>
                            {t.column_count} cols · {t.index_count} idx
                          </span>
                        </div>
                        <div className="table-key-count">
                          <span>{t.primary_key_constraint_count} PK</span>
                          <span>{t.foreign_key_constraint_count} FK</span>
                        </div>
                        <ChevronRight className="row-chevron" size={14} />
                      </button>
                    ))}
                    {filtered.length === 0 && <div className="empty">No tables found. Check the schema or search term.</div>}
                  </div>
                  <div className="panel-footer">
                    <span>
                      <span className="status-dot connected" /> Metadata source
                    </span>
                    <button onClick={() => void loadInventory()}>
                      <RefreshCw size={13} /> Refresh
                    </button>
                  </div>
                </section>

                <section className="panel details" aria-label="Table details">
                  {!selected || !detail ? (
                    <div className="detail-empty">
                      <div className="empty-icon">
                        <Table2 size={22} />
                      </div>
                      <h2>Select a table</h2>
                      <p>Choose a table from the inventory to inspect its columns, keys, indexes, constraints and sample records.</p>
                    </div>
                  ) : (
                    <>
                      <div className="detail-title">
                        <div className="table-symbol large" aria-hidden="true">
                          <Table2 size={18} />
                        </div>
                        <div className="detail-name">
                          <h2>{detail.table}</h2>
                          <span>
                            {detail.schema} <ChevronRight size={11} /> Table metadata
                          </span>
                        </div>
                        <span className="object-badge">TABLE</span>
                      </div>
                      <div className="detail-stats">
                        <MiniStat label="Columns" value={detail.column_count} />
                        <MiniStat label="Primary key columns" value={detail.primary_key?.constrained_columns?.length ?? 0} />
                        <MiniStat label="Foreign keys" value={detail.foreign_keys.length} />
                        <MiniStat label="Indexes" value={detail.indexes.length} />
                      </div>
                      <div className="tabs" role="tablist">
                        {['Columns', 'Keys', 'Indexes', 'Constraints', 'Data'].map(t => (
                          <button
                            key={t}
                            className={tab === t ? 'tab active-tab' : 'tab'}
                            onClick={() => setTab(t)}
                            role="tab"
                            aria-selected={tab === t}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <div className="detail-body" role="tabpanel">
                        {tab === 'Columns' && (
                          <div className="data-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Column</th>
                                  <th>Data Type</th>
                                  <th>Nullable</th>
                                  <th>Properties</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.columns.map(c => (
                                  <tr key={c.name}>
                                    <td>
                                      <strong>{c.name}</strong>
                                      <small>#{c.ordinal_position}</small>
                                    </td>
                                    <td>
                                      <code>{c.data_type}</code>
                                    </td>
                                    <td>
                                      <span className={c.nullable ? 'pill neutral' : 'pill required'}>
                                        {c.nullable ? 'YES' : 'NO'}
                                      </span>
                                    </td>
                                    <td>
                                      <div className="tag-list">
                                        {c.primary_key && <span className="pill primary">PK</span>}
                                        {c.foreign_key && <span className="pill foreign">FK</span>}
                                        {c.unique && <span className="pill unique">UNIQUE</span>}
                                        {c.default !== null && <span className="pill neutral">DEFAULT</span>}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {tab === 'Keys' && (
                          <div className="metadata-sections">
                            <MetaBlock
                              title="Primary key"
                              value={detail.primary_key?.name || 'Primary key'}
                              sub={(detail.primary_key?.constrained_columns || []).join(', ') || 'No primary key detected'}
                            />
                            <MetaBlock
                              title="Foreign keys"
                              value={`${detail.foreign_keys.length} constraint(s)`}
                              sub={
                                detail.foreign_keys
                                  .map(
                                    f =>
                                      `${f.name || 'FK'}: ${(f.constrained_columns || []).join(', ')} → ${f.referred_table}(${(
                                        f.referred_columns || []
                                      ).join(', ')})`
                                  )
                                  .join('\n') || 'No foreign keys detected'
                              }
                            />
                          </div>
                        )}
                        {tab === 'Indexes' && (
                          <div className="data-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Index Name</th>
                                  <th>Columns</th>
                                  <th>Unique</th>
                                  <th>Type</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.indexes.map((idx: any, i: number) => (
                                  <tr key={idx.name || i}>
                                    <td>
                                      <strong>{idx.name || `index_${i + 1}`}</strong>
                                    </td>
                                    <td>{(idx.column_names || []).join(', ') || 'Expression / unavailable'}</td>
                                    <td>{idx.unique ? 'Yes' : 'No'}</td>
                                    <td>{idx.dialect_options?.postgresql_using || 'B-tree / default'}</td>
                                  </tr>
                                ))}
                                {detail.indexes.length === 0 && (
                                  <tr>
                                    <td colSpan={4}>No indexes reported by the database inspector.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {tab === 'Constraints' && (
                          <div className="metadata-sections">
                            <MetaBlock
                              title="Unique constraints"
                              value={`${detail.unique_constraints.length} found`}
                              sub={
                                detail.unique_constraints.map(c => `${c.name}: ${(c.column_names || []).join(', ')}`).join('\n') ||
                                'None detected'
                              }
                            />
                            <MetaBlock
                              title="Check constraints"
                              value={`${detail.check_constraints.length} found`}
                              sub={
                                detail.check_constraints
                                  .map(c => `${c.name}: ${c.sqltext || 'definition unavailable'}`)
                                  .join('\n') || 'None detected'
                              }
                            />
                          </div>
                        )}
                        {tab === 'Data' && (
                          <>
                            <div className="data-note">
                              Read-only preview · {rows?.rows.length ?? 0} rows on this page
                            </div>
                            <div className="data-table-wrap">
                              <table>
                                <thead>
                                  <tr>
                                    {(rows?.columns || []).map(c => (
                                      <th key={c}>{c}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(rows?.rows || []).map((r, i) => (
                                    <tr key={i}>
                                      {(rows?.columns || []).map(c => (
                                        <td key={c}>{r[c] === null ? <em>NULL</em> : String(r[c] ?? '')}</td>
                                      ))}
                                    </tr>
                                  ))}
                                  {rows?.rows.length === 0 && (
                                    <tr>
                                      <td colSpan={rows?.columns.length || 1}>No records found.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                            <div className="pagination">
                              <button disabled={offset === 0} onClick={() => void changePage(Math.max(0, offset - 25))}>
                                Previous
                              </button>
                              <span>
                                Rows {offset + 1}–{offset + (rows?.rows.length || 0)}
                              </span>
                              <button disabled={(rows?.rows.length || 0) < 25} onClick={() => void changePage(offset + 25)}>
                                Next
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </section>
              </div>

              <footer className="footer">
                <span>
                  SchemaPilot <span className="muted">· Database Metadata Intelligence</span>
                </span>
                <span>
                  <CheckCircle2 size={13} /> Read-only mode enabled
                </span>
              </footer>
            </div>
          )}
        </section>
      </main>

      {/* ─── API Server & Vercel Tunnel Configuration Modal ─── */}
      {showApiModal && (
        <div className="api-modal-backdrop" onClick={() => setShowApiModal(false)}>
          <div className="api-modal" onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="api-modal-title">
            <div className="api-modal-header">
              <div className="api-modal-title">
                <div className="provider-icon" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
                  <Server size={18} />
                </div>
                <div>
                  <h3 id="api-modal-title">Backend API Server & Vercel Tunnel</h3>
                  <p>Connect your Vercel deployment to your local computer or cloud backend</p>
                </div>
              </div>
              <button className="icon-button" onClick={() => setShowApiModal(false)} aria-label="Close modal">
                <X size={16} />
              </button>
            </div>

            <div className="api-modal-body">
              {/* Protocol Warning for Vercel / HTTPS */}
              {typeof window !== 'undefined' &&
                window.location.protocol === 'https:' &&
                apiModalInput.trim().toLowerCase().startsWith('http://') && (
                  <div className="tunnel-alert" role="alert">
                    <strong>⚠️ Browser Mixed Content Block Detected</strong>
                    Your frontend is loaded over HTTPS (Vercel). Browsers forbid calling insecure <code>http://</code> endpoints.
                    To connect to a backend running on your computer, forward port 8000 via a free HTTPS tunnel (see guide below) and use the <code>https://</code> URL.
                  </div>
                )}

              {/* Endpoint Input */}
              <div className="form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Backend Server Base URL</span>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11 }}
                    onClick={() => setApiModalInput('http://localhost:8000')}
                  >
                    Reset to Localhost
                  </button>
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="url"
                    className="conn-input"
                    value={apiModalInput}
                    onChange={e => {
                      setApiModalInput(e.target.value)
                      setApiTestStatus('idle')
                      setApiTestMessage('')
                    }}
                    placeholder="https://your-tunnel.ngrok-free.app or http://localhost:8000"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void testApiEndpoint(apiModalInput)}
                    disabled={apiTestStatus === 'testing'}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {apiTestStatus === 'testing' ? (
                      <>
                        <RefreshCw size={13} className="spinning" /> Testing…
                      </>
                    ) : (
                      'Test Ping'
                    )}
                  </button>
                </div>
              </div>

              {/* Test Result Message */}
              {apiTestMessage && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    background: apiTestStatus === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${apiTestStatus === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    color: apiTestStatus === 'success' ? '#34d399' : '#f87171'
                  }}
                >
                  {apiTestStatus === 'success' ? (
                    <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                  ) : (
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                  )}
                  <span>{apiTestMessage}</span>
                </div>
              )}

              {/* Guide Tabs */}
              <div className="api-tabs">
                <button
                  className={`api-tab-btn ${apiGuideTab === 'tunnel' ? 'active' : ''}`}
                  onClick={() => setApiGuideTab('tunnel')}
                >
                  💻 Local Backend to Vercel
                </button>
                <button
                  className={`api-tab-btn ${apiGuideTab === 'vercel' ? 'active' : ''}`}
                  onClick={() => setApiGuideTab('vercel')}
                >
                  ⚡ Vercel Environment Variable
                </button>
                <button
                  className={`api-tab-btn ${apiGuideTab === 'cloud' ? 'active' : ''}`}
                  onClick={() => setApiGuideTab('cloud')}
                >
                  ☁️ Deploy Backend to Cloud
                </button>
              </div>

              {/* Tab 1: Local Tunnel Guide */}
              {apiGuideTab === 'tunnel' && (
                <div className="tunnel-guide-box">
                  <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                    How to connect your Vercel frontend to your computer's backend:
                  </div>
                  <ol style={{ paddingLeft: 18, margin: 0 }}>
                    <li style={{ marginBottom: 8 }}>
                      Make sure your backend is running in your terminal:
                      <div className="command-snippet">
                        <span>uvicorn app.main:app --reload --port 8000</span>
                        <button
                          className="copy-cmd-btn"
                          onClick={() => copyToClipboard('uvicorn app.main:app --reload --port 8000', 'uvicorn')}
                        >
                          {copiedCmd === 'uvicorn' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </li>
                    <li style={{ marginBottom: 8 }}>
                      Open a <strong>second terminal</strong> and create a free HTTPS tunnel:
                      <div style={{ margin: '4px 0 2px', fontSize: 11, color: 'var(--text-muted)' }}>
                        Option 1 (No signup, works instantly):
                      </div>
                      <div className="command-snippet">
                        <span>npx localtunnel --port 8000</span>
                        <button
                          className="copy-cmd-btn"
                          onClick={() => copyToClipboard('npx localtunnel --port 8000', 'localtunnel')}
                        >
                          {copiedCmd === 'localtunnel' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div style={{ margin: '6px 0 2px', fontSize: 11, color: 'var(--text-muted)' }}>
                        Option 2 (Ngrok):
                      </div>
                      <div className="command-snippet">
                        <span>ngrok http 8000</span>
                        <button
                          className="copy-cmd-btn"
                          onClick={() => copyToClipboard('ngrok http 8000', 'ngrok')}
                        >
                          {copiedCmd === 'ngrok' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </li>
                    <li>
                      Copy the resulting <code>https://...</code> URL and paste it into the input field above, then click <strong>Save & Apply</strong>.
                    </li>
                  </ol>
                </div>
              )}

              {/* Tab 2: Vercel Settings */}
              {apiGuideTab === 'vercel' && (
                <div className="tunnel-guide-box">
                  <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                    Bake API URL permanently into your Vercel build:
                  </div>
                  <ol style={{ paddingLeft: 18, margin: 0 }}>
                    <li style={{ marginBottom: 6 }}>
                      Go to your <strong>Vercel Dashboard</strong> → Select your SchemaPilot Project.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      Navigate to <strong>Settings</strong> → <strong>Environment Variables</strong>.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      Add a new variable:
                      <div style={{ background: 'var(--bg-surface-2)', padding: '6px 10px', borderRadius: 4, margin: '4px 0' }}>
                        <div><strong>Key:</strong> <code>VITE_API_BASE_URL</code></div>
                        <div><strong>Value:</strong> <code>https://your-tunnel-or-cloud-backend.com</code></div>
                      </div>
                    </li>
                    <li>
                      Go to the <strong>Deployments</strong> tab and click <strong>Redeploy</strong>.
                    </li>
                  </ol>
                </div>
              )}

              {/* Tab 3: Free Cloud Backend */}
              {apiGuideTab === 'cloud' && (
                <div className="tunnel-guide-box">
                  <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                    Want 24/7 backend without keeping your computer on?
                  </div>
                  <p style={{ margin: '4px 0 8px' }}>
                    You can host the FastAPI backend for free on <strong>Render.com</strong> or <strong>Railway.app</strong>:
                  </p>
                  <ol style={{ paddingLeft: 18, margin: 0 }}>
                    <li style={{ marginBottom: 6 }}>
                      Create a free account on <a href="https://render.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Render.com</a>.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      Click <strong>New +</strong> → <strong>Web Service</strong> → Connect your GitHub repository.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      Set Root Directory to <code>backend</code>, Build Command: <code>pip install -r requirements.txt</code>, Start Command: <code>uvicorn app.main:app --host 0.0.0.0 --port $PORT</code>.
                    </li>
                    <li style={{ marginBottom: 6 }}>
                      Add Environment Variables: <code>DATABASE_URL</code> and <code>CORS_ORIGINS=*</code>.
                    </li>
                    <li>
                      Copy your free Render URL (e.g. <code>https://schemapilot-backend.onrender.com</code>) and paste it into SchemaPilot!
                    </li>
                  </ol>
                </div>
              )}
            </div>

            <div className="api-modal-footer">
              <button className="button secondary" onClick={() => setShowApiModal(false)}>
                Cancel
              </button>
              <button
                className="button primary"
                onClick={() => handleSaveApiUrl(apiModalInput)}
              >
                <Check size={14} /> Save & Apply Connection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Sub-components ─── */

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value?: number; tone: string }) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`} aria-hidden="true">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value ?? '—'}</strong>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function MetaBlock({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="meta-block">
      <span>{title}</span>
      <strong>{value}</strong>
      <pre>{sub}</pre>
    </div>
  )
}

export default App
