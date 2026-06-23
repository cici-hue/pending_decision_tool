import { useState, useEffect, useRef } from 'react'
import { 
  BookOpen, Tag, Search, Scale, Database, BarChart3, 
  X, Plus, Edit2, Trash2, ChevronDown, ChevronRight,
  Upload, Image, AlertCircle, CheckCircle, Filter,
  Download, FileSpreadsheet, FileText, User, Lock,
  Import, FileUp
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

// 获取存储的token
function getToken() {
  return localStorage.getItem('calibration_token')
}

// API请求封装
async function apiRequest(method: string, endpoint: string, body?: any) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '请求失败' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

// 登录组件
function LoginModal({ onLogin }: { onLogin: (user: any) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const data = await apiRequest('POST', '/auth/login', { username, password })
      localStorage.setItem('calibration_token', data.token)
      localStorage.setItem('calibration_user', JSON.stringify(data.user))
      onLogin(data.user)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <Lock className="w-8 h-8 text-blue-400" />
          <h2 className="text-2xl font-bold">缺陷判定校准系统</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-slate-700 rounded-lg px-4 py-2 text-white"
              placeholder="请输入用户名"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-700 rounded-lg px-4 py-2 text-white"
              placeholder="请输入密码"
            />
          </div>
          
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
        
        <p className="mt-4 text-xs text-slate-500 text-center">
          默认管理员: admin / admin123
        </p>
      </div>
    </div>
  )
}

// 标准案例库组件
function StandardCaseLibrary({ isAdmin }: { isAdmin: boolean }) {
  const [cases, setCases] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [severityLevels, setSeverityLevels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [casesData, catData, sevData] = await Promise.all([
        apiRequest('GET', '/cases'),
        apiRequest('GET', '/defect-categories'),
        apiRequest('GET', '/severity-levels')
      ])
      setCases(casesData)
      setCategories(catData)
      setSeverityLevels(sevData)
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredCases = cases.filter(c => {
    const matchSearch = !search || 
      c.title?.includes(search) || 
      c.description?.includes(search)
    const matchCategory = !selectedCategory || 
      c.defect_category_id === parseInt(selectedCategory)
    return matchSearch && matchCategory
  })

  if (loading) return <div className="text-center py-8">加载中...</div>

  return (
    <div className="space-y-4">
      {/* 搜索和筛选 */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索案例..."
            className="w-full bg-slate-700 rounded-lg pl-10 pr-4 py-2 text-white"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="bg-slate-700 rounded-lg px-4 py-2 text-white"
        >
          <option value="">所有分类</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            新增案例
          </button>
        )}
      </div>

      {/* 案例列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCases.map(item => (
          <div key={item.id} className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
            {/* 图片区域 */}
            <div className="aspect-video bg-slate-700 relative">
              {item.images && item.images.length > 0 ? (
                <img 
                  src={item.images[0].original} 
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <Image className="w-12 h-12" />
                </div>
              )}
              <div 
                className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium"
                style={{ backgroundColor: item.severity_color + '20', color: item.severity_color }}
              >
                {item.severity_name}
              </div>
            </div>
            
            {/* 内容区域 */}
            <div className="p-4">
              <h3 className="font-medium mb-2">{item.title}</h3>
              <p className="text-sm text-slate-400 mb-3 line-clamp-2">{item.description}</p>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="px-2 py-1 bg-slate-700 rounded">{item.category_name}</span>
                {item.subcategory_name && (
                  <span className="px-2 py-1 bg-slate-700 rounded">{item.subcategory_name}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredCases.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <BookOpen className="w-12 h-12 mx-auto mb-4" />
          <p>暂无案例数据</p>
        </div>
      )}
    </div>
  )
}

// 缺陷标签管理组件
function TagManagement({ isAdmin }: { isAdmin: boolean }) {
  const [activeTab, setActiveTab] = useState<'customer' | 'defect' | 'severity'>('customer')
  const [customerTypes, setCustomerTypes] = useState<any[]>([])
  const [defectCategories, setDefectCategories] = useState<any[]>([])
  const [severityLevels, setSeverityLevels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [ctData, dcData, slData] = await Promise.all([
        apiRequest('GET', '/customer-types'),
        apiRequest('GET', '/defect-categories'),
        apiRequest('GET', '/severity-levels')
      ])
      setCustomerTypes(ctData)
      setDefectCategories(dcData)
      setSeverityLevels(slData)
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCustomer = async () => {
    const name = prompt('请输入客人类型名称:')
    if (!name) return
    try {
      await apiRequest('POST', '/customer-types', { name })
      loadData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleAddCategory = async () => {
    const name = prompt('请输入缺陷大类名称:')
    if (!name) return
    try {
      await apiRequest('POST', '/defect-categories', { name })
      loadData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleAddSeverity = async () => {
    const name = prompt('请输入严重等级名称:')
    if (!name) return
    const level = parseInt(prompt('请输入等级数字 (1-4, 1为最高):') || '3')
    try {
      await apiRequest('POST', '/severity-levels', { name, level })
      loadData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading) return <div className="text-center py-8">加载中...</div>

  return (
    <div className="space-y-4">
      {/* 标签页 */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('customer')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'customer' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
          }`}
        >
          客人类型
        </button>
        <button
          onClick={() => setActiveTab('defect')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'defect' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
          }`}
        >
          缺陷类型
        </button>
        <button
          onClick={() => setActiveTab('severity')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'severity' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
          }`}
        >
          严重等级
        </button>
      </div>

      {/* 内容区域 */}
      <div className="bg-slate-800 rounded-xl p-6">
        {activeTab === 'customer' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">客人类型</h3>
              {isAdmin && (
                <button
                  onClick={handleAddCustomer}
                  className="flex items-center gap-2 px-3 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30"
                >
                  <Plus className="w-4 h-4" />
                  添加
                </button>
              )}
            </div>
            <div className="space-y-2">
              {customerTypes.map(ct => (
                <div key={ct.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                  <span>{ct.name}</span>
                  <span className="text-xs text-slate-500">{ct.code}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'defect' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">缺陷类型</h3>
              {isAdmin && (
                <button
                  onClick={handleAddCategory}
                  className="flex items-center gap-2 px-3 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30"
                >
                  <Plus className="w-4 h-4" />
                  添加大类
                </button>
              )}
            </div>
            <div className="space-y-4">
              {defectCategories.map(cat => (
                <div key={cat.id} className="bg-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                    <span className="font-medium">{cat.name}</span>
                  </div>
                  {cat.children && cat.children.length > 0 && (
                    <div className="ml-6 space-y-1">
                      {cat.children.map((child: any) => (
                        <div key={child.id} className="text-sm text-slate-400">
                          └─ {child.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'severity' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">严重等级</h3>
              {isAdmin && (
                <button
                  onClick={handleAddSeverity}
                  className="flex items-center gap-2 px-3 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30"
                >
                  <Plus className="w-4 h-4" />
                  添加
                </button>
              )}
            </div>
            <div className="space-y-2">
              {severityLevels.map(sl => (
                <div key={sl.id} className="flex items-center gap-4 p-3 bg-slate-700/50 rounded-lg">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: sl.color }}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{sl.name}</div>
                    <div className="text-xs text-slate-400">{sl.rules}</div>
                  </div>
                  <span className="text-xs text-slate-500">Level {sl.level}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// 缺陷判定校准组件
function DefectCalibration() {
  const [defects, setDefects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDefect, setSelectedDefect] = useState<any>(null)

  useEffect(() => {
    loadDefects()
  }, [])

  const loadDefects = async () => {
    try {
      const data = await apiRequest('GET', '/defects')
      setDefects(data)
    } catch (err) {
      console.error('加载缺陷失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCalibrate = async (defectId: number, newCategoryId: number, newSeverityId: number, reason: string) => {
    try {
      await apiRequest('POST', `/defects/${defectId}/calibrate`, {
        categoryId: newCategoryId,
        severityId: newSeverityId,
        reason
      })
      loadDefects()
      setSelectedDefect(null)
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading) return <div className="text-center py-8">加载中...</div>

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-700/50">
              <th className="text-left p-4 text-sm font-medium text-slate-400">报告信息</th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">缺陷描述</th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">当前判定</th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">状态</th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">操作</th>
            </tr>
          </thead>
          <tbody>
            {defects.map(defect => (
              <tr key={defect.id} className="border-t border-slate-700/50">
                <td className="p-4">
                  <div className="text-sm">PO: {defect.report_po_no}</div>
                  <div className="text-xs text-slate-500">Style: {defect.report_style_no}</div>
                </td>
                <td className="p-4">
                  <div className="text-sm">{defect.description}</div>
                  <div className="text-xs text-slate-500">{defect.location}</div>
                </td>
                <td className="p-4">
                  <div className="text-sm">{defect.category_name}</div>
                  <div 
                    className="text-xs inline-block px-2 py-0.5 rounded mt-1"
                    style={{ 
                      backgroundColor: defect.severity_color + '20', 
                      color: defect.severity_color 
                    }}
                  >
                    {defect.severity_name}
                  </div>
                </td>
                <td className="p-4">
                  {defect.is_calibrated ? (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle className="w-3 h-3" />
                      已校准
                    </span>
                  ) : (
                    <span className="text-xs text-yellow-400">待校准</span>
                  )}
                </td>
                <td className="p-4">
                  <button
                    onClick={() => setSelectedDefect(defect)}
                    className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded text-sm hover:bg-blue-600/30"
                  >
                    校准
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {defects.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <Scale className="w-12 h-12 mx-auto mb-4" />
          <p>暂无缺陷记录</p>
        </div>
      )}
    </div>
  )
}

// 缺陷数据库检索组件
function DefectDatabase() {
  const [defects, setDefects] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    customerType: '',
    category: '',
    severity: ''
  })
  const [showImportModal, setShowImportModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadDefects()
  }, [])

  const loadDefects = async () => {
    try {
      const data = await apiRequest('GET', '/defects')
      setDefects(data)
    } catch (err) {
      console.error('加载缺陷失败:', err)
    }
  }

  const handleExport = async (format: 'excel' | 'pdf') => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (filters.customerType) params.append('customerTypeId', filters.customerType)
      if (filters.category) params.append('categoryId', filters.category)
      if (filters.severity) params.append('severityId', filters.severity)
      if (search) params.append('search', search)

      const response = await fetch(`${API_BASE}/export/${format}?${params}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      })
      const result = await response.json()
      
      if (result.success && result.downloadUrl) {
        // 触发下载
        const downloadResponse = await fetch(`${API_BASE}${result.downloadUrl.replace('/api/', '/')}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        })
        const blob = await downloadResponse.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = result.filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        
        alert(`导出成功！共 ${result.count} 条记录`)
      }
    } catch (err: any) {
      alert('导出失败: ' + err.message)
    } finally {
      setExporting(false)
      setShowExportModal(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE}/import/excel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
      })

      const result = await response.json()
      setImportResult(result)
      
      if (result.success) {
        loadDefects()
      }
    } catch (err: any) {
      setImportResult({ success: false, error: err.message })
    } finally {
      setImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const filteredDefects = defects.filter(d => {
    const matchSearch = !search || 
      d.description?.includes(search) || 
      d.report_po_no?.includes(search)
    const matchCustomer = !filters.customerType || d.customer_type_id === parseInt(filters.customerType)
    const matchCategory = !filters.category || d.defect_category_id === parseInt(filters.category)
    const matchSeverity = !filters.severity || d.severity_id === parseInt(filters.severity)
    return matchSearch && matchCustomer && matchCategory && matchSeverity
  })

  return (
    <div className="space-y-4">
      {/* 搜索和筛选 */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索缺陷描述、PO号..."
            className="w-full bg-slate-700 rounded-lg pl-10 pr-4 py-2 text-white"
          />
        </div>
        <button 
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors"
        >
          <FileUp className="w-4 h-4" />
          导入
        </button>
        <button 
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          导出
        </button>
      </div>

      {/* 导入弹窗 */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">导入缺陷数据</h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center">
                <FileUp className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                <p className="text-sm text-slate-400 mb-4">支持 Excel (.xlsx) 格式</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImport}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {importing ? '导入中...' : '选择文件'}
                </button>
              </div>

              {importResult && (
                <div className={`p-4 rounded-lg ${importResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {importResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    )}
                    <span className={importResult.success ? 'text-green-400' : 'text-red-400'}>
                      {importResult.success ? '导入成功' : '导入失败'}
                    </span>
                  </div>
                  {importResult.success && (
                    <p className="text-sm text-slate-400">
                      成功导入 {importResult.imported} / {importResult.total} 条记录
                    </p>
                  )}
                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="mt-2 text-xs text-red-400 space-y-1">
                      {importResult.errors.map((error: string, i: number) => (
                        <p key={i}>{error}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 导出弹窗 */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">导出缺陷数据</h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <p className="text-sm text-slate-400 mb-4">
                当前筛选条件: {filteredDefects.length} 条记录
              </p>
              <button
                onClick={() => handleExport('excel')}
                disabled={exporting}
                className="w-full flex items-center gap-3 p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                <FileSpreadsheet className="w-8 h-8 text-green-400" />
                <div className="text-left">
                  <div className="font-medium">导出为 Excel</div>
                  <div className="text-xs text-slate-400">.xlsx 格式，适合数据分析</div>
                </div>
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={exporting}
                className="w-full flex items-center gap-3 p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                <FileText className="w-8 h-8 text-red-400" />
                <div className="text-left">
                  <div className="font-medium">导出为 PDF</div>
                  <div className="text-xs text-slate-400">.pdf 格式，适合打印和分享</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 结果列表 */}
      <div className="bg-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-700/50">
              <th className="text-left p-4 text-sm font-medium text-slate-400">报告信息</th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">缺陷描述</th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">分类</th>
              <th className="text-left p-4 text-sm font-medium text-slate-400">校准状态</th>
            </tr>
          </thead>
          <tbody>
            {filteredDefects.map(defect => (
              <tr key={defect.id} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                <td className="p-4">
                  <div className="text-sm">PO: {defect.report_po_no}</div>
                  <div className="text-xs text-slate-500">{defect.customer_type_name}</div>
                </td>
                <td className="p-4">
                  <div className="text-sm">{defect.description}</div>
                </td>
                <td className="p-4">
                  <div className="text-sm">{defect.category_name}</div>
                  <div className="text-xs" style={{ color: defect.severity_color }}>
                    {defect.severity_name}
                  </div>
                </td>
                <td className="p-4">
                  {defect.is_calibrated ? (
                    <span className="text-xs text-green-400">已校准</span>
                  ) : (
                    <span className="text-xs text-yellow-400">未校准</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// 统计分析组件
function StatisticsOverview() {
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const data = await apiRequest('GET', '/stats/overview')
      setStats(data)
    } catch (err) {
      console.error('加载统计失败:', err)
    }
  }

  if (!stats) return <div className="text-center py-8">加载中...</div>

  return (
    <div className="space-y-6">
      {/* 概览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Database className="w-5 h-5 text-blue-400" />
            <span className="text-slate-400">缺陷记录总数</span>
          </div>
          <div className="text-3xl font-bold">{stats.totalDefects}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-slate-400">已校准</span>
          </div>
          <div className="text-3xl font-bold">{stats.calibratedDefects}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="w-5 h-5 text-purple-400" />
            <span className="text-slate-400">标准案例</span>
          </div>
          <div className="text-3xl font-bold">{stats.totalCases}</div>
        </div>
      </div>

      {/* 偏差统计 */}
      <div className="bg-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-medium mb-4">高频偏差项</h3>
        <div className="space-y-3">
          {/* 这里可以添加偏差统计图表 */}
          <p className="text-slate-500 text-sm">暂无偏差数据</p>
        </div>
      </div>
    </div>
  )
}

// 主组件
export default function CalibrationSystem() {
  const [user, setUser] = useState<any>(null)
  const [activeModule, setActiveModule] = useState<'cases' | 'tags' | 'calibrate' | 'database' | 'stats'>('cases')

  useEffect(() => {
    // 检查本地存储的登录状态
    const savedUser = localStorage.getItem('calibration_user')
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch {
        localStorage.removeItem('calibration_user')
        localStorage.removeItem('calibration_token')
      }
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('calibration_token')
    localStorage.removeItem('calibration_user')
    setUser(null)
  }

  const isAdmin = user?.role === 'admin'

  if (!user) {
    return <LoginModal onLogin={setUser} />
  }

  const menuItems = [
    { id: 'cases' as const, label: '标准案例库', icon: BookOpen },
    { id: 'tags' as const, label: '标签管理', icon: Tag },
    { id: 'calibrate' as const, label: '判定校准', icon: Scale },
    { id: 'database' as const, label: '缺陷数据库', icon: Database },
    { id: 'stats' as const, label: '统计分析', icon: BarChart3 },
  ]

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="w-8 h-8 text-blue-400" />
            <h1 className="text-xl font-bold">缺陷判定校准系统</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">
              <User className="w-4 h-4 inline mr-1" />
              {user.displayName || user.username}
              <span className="ml-2 px-2 py-0.5 bg-slate-700 rounded text-xs">
                {user.role === 'admin' ? '管理员' : user.role === 'auditor' ? '审核员' : 'QC'}
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              退出
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-slate-800 rounded-xl p-4 space-y-2">
              {menuItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveModule(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                    activeModule === item.id 
                      ? 'bg-blue-600 text-white' 
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1">
            {activeModule === 'cases' && <StandardCaseLibrary isAdmin={isAdmin} />}
            {activeModule === 'tags' && <TagManagement isAdmin={isAdmin} />}
            {activeModule === 'calibrate' && <DefectCalibration />}
            {activeModule === 'database' && <DefectDatabase />}
            {activeModule === 'stats' && <StatisticsOverview />}
          </div>
        </div>
      </div>
    </div>
  )
}
