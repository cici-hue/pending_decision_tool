import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { generateEmail as generateEmailContent, extractPdfWithDoubao } from './services/minimaxApi'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { Dashboard } from './components/Dashboard'
import { EmailTemplates, EmailTemplate, DEFAULT_TEMPLATE } from './components/EmailTemplates'
import CalibrationSystem from './components/CalibrationSystem'
import { Upload, FileText, Mail, X, Save, Edit3, AlertCircle, CheckCircle, Loader2, HelpCircle, LayoutDashboard, CheckSquare, Square, Settings, Clock, Scale } from 'lucide-react'

// PDF.js  worker 配置
import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

export interface DefectDetail {
  description: string
  count: number
  rate: string
}

export interface ReportData {
  id: string
  fileName: string
  styleNo: string
  poNo: string
  itemNo: string
  deliveredQty: string
  shipDate: string
  inspectionQty: number
  pendingIssue: string
  defectDetails: DefectDetail[]
  customer: string
  vendor: string
  timestamp: number
  emailSent?: boolean
  sentAt?: number
}

const HISTORY_KEY = 'pending_report_history'

type ViewMode = 'list' | 'dashboard' | 'batch'

function loadHistory(): ReportData[] {
  try {
    const data = localStorage.getItem(HISTORY_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveHistory(history: ReportData[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
}

// 提取 PDF 文本内容
async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const strings = content.items.map((item: any) => item.str)
    fullText += strings.join(' ') + '\n'
  }
  return fullText
}

export default function App() {
  const { t } = useTranslation()
  const [history, setHistory] = useState<ReportData[]>(loadHistory)
  const [currentReport, setCurrentReport] = useState<ReportData | null>(null)
  const [emailStatus, setEmailStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set())
  const [showTemplates, setShowTemplates] = useState(false)
  const [currentTemplate, setCurrentTemplate] = useState<EmailTemplate>(DEFAULT_TEMPLATE)
  
  // 校准系统显示状态
  const [showCalibration, setShowCalibration] = useState(false)
  
  // 编辑相关状态
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  
  // 疵点编辑状态
  const [editingDefectIndex, setEditingDefectIndex] = useState<number | null>(null)
  const [editingDefectField, setEditingDefectField] = useState<'description' | 'count' | null>(null)
  const [editDefectValue, setEditDefectValue] = useState('')
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    setIsExtracting(true)
    setExtractionError(null)
    
    try {
      for (const file of files) {
        // 1. 提取 PDF 文本
        const pdfText = await extractPdfText(file)
        
        // 2. 使用 AI API 提取信息
        const extracted = await extractPdfWithDoubao(pdfText)
        
        // 3. 创建报告数据
        const report: ReportData = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          fileName: file.name,
          styleNo: extracted.styleNo || 'N/A',
          poNo: extracted.poNo || 'N/A',
          itemNo: extracted.itemNo || 'N/A',
          deliveredQty: extracted.deliveredQty || 'N/A',
          shipDate: extracted.shipDate || 'N/A',
          inspectionQty: extracted.inspectionQty || 0,
          pendingIssue: extracted.pendingIssue || '',
          defectDetails: extracted.defectDetails || [],
          customer: extracted.customer || '',
          vendor: extracted.vendor || '',
          timestamp: Date.now(),
          emailSent: false
        }
        
        // 4. 保存到历史记录
        const newHistory = [report, ...history]
        setHistory(newHistory)
        saveHistory(newHistory)
        
        // 5. 显示当前报告
        setCurrentReport(report)
      }
    } catch (error: any) {
      console.error('提取失败:', error)
      setExtractionError(error.message || '提取失败，请检查 API Key 和网络连接')
    } finally {
      setIsExtracting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [history])

  const startEdit = (field: string) => {
    if (currentReport) {
      setEditingField(field)
      setEditValue(String(currentReport[field as keyof ReportData] || ''))
    }
  }

  const saveEdit = () => {
    if (currentReport && editingField) {
      const updated = { ...currentReport, [editingField]: editValue }
      
      setCurrentReport(updated)
      const updatedHistory = history.map(item => item.id === currentReport.id ? updated : item)
      setHistory(updatedHistory)
      saveHistory(updatedHistory)
    }
    setEditingField(null)
    setEditValue('')
  }

  // 疵点编辑保存
  const saveDefectEdit = () => {
    if (currentReport && editingDefectIndex !== null && editingDefectField) {
      const updatedDefects = [...currentReport.defectDetails]
      const defect = updatedDefects[editingDefectIndex]
      
      if (editingDefectField === 'description') {
        defect.description = editDefectValue
      } else if (editingDefectField === 'count') {
        const count = parseInt(editDefectValue) || 0
        defect.count = count
        // 自动重新计算比例
        const rate = ((count / (currentReport.inspectionQty || 1)) * 100).toFixed(1)
        defect.rate = `${rate}%`
      }
      
      const updated = { ...currentReport, defectDetails: updatedDefects }
      setCurrentReport(updated)
      const updatedHistory = history.map(item => item.id === currentReport.id ? updated : item)
      setHistory(updatedHistory)
      saveHistory(updatedHistory)
    }
    setEditingDefectIndex(null)
    setEditingDefectField(null)
    setEditDefectValue('')
  }

  // 开始编辑疵点
  const startEditDefect = (index: number, field: 'description' | 'count', value: string | number) => {
    setEditingDefectIndex(index)
    setEditingDefectField(field)
    setEditDefectValue(String(value))
  }

  // 新增疵点记录
  const addDefect = () => {
    if (!currentReport) return
    
    const newDefect: DefectDetail = {
      description: '新疵点描述',
      count: 0,
      rate: '0.0%'
    }
    
    const updatedDefects = [...currentReport.defectDetails, newDefect]
    const updated = { ...currentReport, defectDetails: updatedDefects }
    setCurrentReport(updated)
    const updatedHistory = history.map(item => item.id === currentReport.id ? updated : item)
    setHistory(updatedHistory)
    saveHistory(updatedHistory)
  }

  // 删除疵点记录
  const deleteDefect = (index: number) => {
    if (!currentReport) return
    
    const updatedDefects = currentReport.defectDetails.filter((_, i) => i !== index)
    const updated = { ...currentReport, defectDetails: updatedDefects }
    setCurrentReport(updated)
    const updatedHistory = history.map(item => item.id === currentReport.id ? updated : item)
    setHistory(updatedHistory)
    saveHistory(updatedHistory)
  }

  // 生成单个邮件
  const handleGenerateEmail = async () => {
    if (!currentReport) return
    
    await generateEmailForReport(currentReport)
  }

  // 为单个报告生成邮件
  const generateEmailForReport = async (report: ReportData) => {
    const { subject, body, htmlBody } = generateEmailContent(report)
    
    // 尝试复制 HTML 格式到剪贴板
    try {
      const blob = new Blob([htmlBody], { type: 'text/html' })
      const clipboardItem = new ClipboardItem({ 'text/html': blob })
      await navigator.clipboard.write([clipboardItem])
    } catch (err) {
      try {
        await navigator.clipboard.writeText(body)
      } catch (err2) {
        console.error('Failed to copy:', err2)
      }
    }
    
    // 打开邮件客户端
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(mailtoLink, '_blank')
    
    // 更新发送状态
    const updated = { ...report, emailSent: true, sentAt: Date.now() }
    const updatedHistory = history.map(item => item.id === report.id ? updated : item)
    setHistory(updatedHistory)
    saveHistory(updatedHistory)
    
    if (currentReport?.id === report.id) {
      setCurrentReport(updated)
    }
  }

  // 批量生成邮件
  const handleBatchGenerateEmail = async () => {
    const reportsToSend = history.filter(r => selectedReports.has(r.id))
    if (reportsToSend.length === 0) return
    
    for (const report of reportsToSend) {
      await generateEmailForReport(report)
      // 延迟一下避免浏览器阻止弹窗
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    setEmailStatus('success')
    setTimeout(() => setEmailStatus('idle'), 3000)
    setSelectedReports(new Set())
  }

  const selectReport = (report: ReportData) => {
    setCurrentReport(report)
    setEmailStatus('idle')
  }

  const clearCurrent = () => {
    setCurrentReport(null)
    setEmailStatus('idle')
  }

  const deleteReport = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newHistory = history.filter(item => item.id !== id)
    setHistory(newHistory)
    saveHistory(newHistory)
    if (currentReport?.id === id) {
      setCurrentReport(null)
    }
    // 从选中列表中移除
    const newSelected = new Set(selectedReports)
    newSelected.delete(id)
    setSelectedReports(newSelected)
  }

  // 切换报告选择
  const toggleReportSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newSelected = new Set(selectedReports)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedReports(newSelected)
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedReports.size === history.length) {
      setSelectedReports(new Set())
    } else {
      setSelectedReports(new Set(history.map(r => r.id)))
    }
  }

  // 格式化日期
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-400" />
            <h1 className="text-xl font-bold">{t('app.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* 视图切换 */}
            <button
              onClick={() => setViewMode('dashboard')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
                viewMode === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>仪表盘</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
                viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>列表</span>
            </button>
            <button
              onClick={() => setViewMode('batch')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
                viewMode === 'batch' ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>批量</span>
            </button>
            <div className="w-px h-6 bg-slate-600 mx-1"></div>
            <button
              onClick={() => setShowTemplates(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm bg-slate-700 hover:bg-slate-600 text-slate-200"
            >
              <Settings className="w-4 h-4" />
              <span>邮件模板</span>
            </button>
            <button
              onClick={() => setShowCalibration(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm bg-purple-600 hover:bg-purple-500 text-white"
            >
              <Scale className="w-4 h-4" />
              <span>缺陷校准</span>
            </button>
            <div className="w-px h-6 bg-slate-600 mx-1"></div>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
                showHelp ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
              title={t('app.help')}
            >
              <HelpCircle className="w-4 h-4" />
              <span>{t('app.help')}</span>
            </button>
            <LanguageSwitcher />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isExtracting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50"
            >
              {isExtracting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              {isExtracting ? t('app.extracting') : t('app.uploadPDF')}
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {extractionError && (
        <div className="max-w-6xl mx-auto px-6 mt-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{extractionError}</span>
            <button onClick={() => setExtractionError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="max-w-6xl mx-auto px-6 mt-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-blue-400">{t('help.title')}</h2>
              <button 
                onClick={() => setShowHelp(false)}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Steps */}
            <div className="space-y-4 mb-6">
              {(t('help.steps', { returnObjects: true }) as any[]).map((step: any, index: number) => (
                <div key={index} className="bg-slate-700/50 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-200 mb-2">{step.title}</h3>
                  <p className="text-slate-400 text-sm whitespace-pre-line">{step.content}</p>
                </div>
              ))}
            </div>
            
            {/* Tips */}
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
              <h3 className="font-semibold text-blue-400 mb-3">{t('help.tips.title')}</h3>
              <ul className="space-y-2">
                {(t('help.tips.items', { returnObjects: true }) as string[]).map((tip: string, index: number) => (
                  <li key={index} className="text-slate-400 text-sm flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {viewMode === 'dashboard' ? (
          <Dashboard reports={history} />
        ) : viewMode === 'batch' ? (
          <div className="space-y-4">
            {/* 批量操作栏 */}
            <div className="bg-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  {selectedReports.size === history.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  <span>全选 ({selectedReports.size}/{history.length})</span>
                </button>
              </div>
              <button
                onClick={handleBatchGenerateEmail}
                disabled={selectedReports.size === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Mail className="w-4 h-4" />
                <span>批量生成邮件 ({selectedReports.size})</span>
              </button>
            </div>

            {/* 报告列表 */}
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="space-y-2">
                {history.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">暂无报告</p>
                ) : (
                  history.map(report => (
                    <div
                      key={report.id}
                      onClick={() => selectReport(report)}
                      className={`p-4 rounded-lg cursor-pointer transition-colors border ${
                        selectedReports.has(report.id) 
                          ? 'bg-blue-600/20 border-blue-500/50' 
                          : 'bg-slate-700/50 border-transparent hover:bg-slate-700'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <button
                          onClick={(e) => toggleReportSelection(report.id, e)}
                          className="mt-1 p-1 hover:bg-slate-600 rounded"
                        >
                          {selectedReports.has(report.id) ? (
                            <CheckSquare className="w-5 h-5 text-blue-400" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-500" />
                          )}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium">{report.fileName}</p>
                            <div className="flex items-center gap-2">
                              {report.emailSent && (
                                <span className="flex items-center gap-1 text-xs text-green-400">
                                  <CheckCircle className="w-3 h-3" />
                                  {report.sentAt ? formatDate(report.sentAt) : '已发送'}
                                </span>
                              )}
                              <button
                                onClick={(e) => deleteReport(report.id, e)}
                                className="p-1 hover:bg-slate-600 rounded"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-4 text-sm text-slate-400">
                            <div>PO#: {report.poNo}</div>
                            <div>Style#: {report.styleNo}</div>
                            <div>Customer: {report.customer}</div>
                            <div>Vendor: {report.vendor}</div>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            疵点: {report.defectDetails.length} 项 | 
                            检验数量: {report.inspectionQty} | 
                            导入时间: {formatDate(report.timestamp)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 历史记录列表 */}
            <div className="lg:col-span-1 bg-slate-800 rounded-xl p-4">
              <h2 className="text-lg font-medium mb-4">{t('app.history')} ({history.length})</h2>
              {history.length === 0 ? (
                <p className="text-slate-400 text-sm">{t('app.noHistory')}</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {history.map(report => (
                    <div
                      key={report.id}
                      onClick={() => selectReport(report)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        currentReport?.id === report.id ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">{report.fileName}</p>
                          <p className="text-xs text-slate-400 truncate">PO#: {report.poNo}</p>
                          <p className="text-xs text-slate-400 truncate">Style#: {report.styleNo}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {report.emailSent && (
                            <span className="flex items-center gap-1 text-xs text-green-400" title={report.sentAt ? new Date(report.sentAt).toLocaleString() : ''}>
                              <Clock className="w-3 h-3" />
                            </span>
                          )}
                          <button
                            onClick={(e) => deleteReport(report.id, e)}
                            className="p-1 hover:bg-slate-500 rounded"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 当前报告详情 */}
            <div className="lg:col-span-2">
              {currentReport ? (
                <div className="bg-slate-800 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <FileText className="w-6 h-6 text-blue-400" />
                      <span className="text-lg font-medium">{currentReport.fileName}</span>
                      {currentReport.emailSent && currentReport.sentAt && (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          已发送于 {formatDate(currentReport.sentAt)}
                        </span>
                      )}
                    </div>
                    <button onClick={clearCurrent} className="p-2 hover:bg-slate-700 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 基本信息 */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">{t('fields.poNo')}</p>
                      {editingField === 'poNo' ? (
                        <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                      ) : (
                        <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('poNo')}>{currentReport.poNo}</p>
                      )}
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">{t('fields.shipDate')}</p>
                      {editingField === 'shipDate' ? (
                        <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                      ) : (
                        <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('shipDate')}>{currentReport.shipDate}</p>
                      )}
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">{t('fields.styleNo')}</p>
                      {editingField === 'styleNo' ? (
                        <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                      ) : (
                        <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('styleNo')}>{currentReport.styleNo}</p>
                      )}
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">{t('fields.itemNo')}</p>
                      {editingField === 'itemNo' ? (
                        <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                      ) : (
                        <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('itemNo')}>{currentReport.itemNo}</p>
                      )}
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">{t('fields.deliveredQty')}</p>
                      {editingField === 'deliveredQty' ? (
                        <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                      ) : (
                        <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('deliveredQty')}>{currentReport.deliveredQty}</p>
                      )}
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">{t('fields.inspectionQty')}</p>
                      <p className="text-lg font-bold text-green-400">{currentReport.inspectionQty || 'N/A'}</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">{t('fields.customer')}</p>
                      {editingField === 'customer' ? (
                        <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                      ) : (
                        <p className="font-medium cursor-pointer hover:text-blue-400" onClick={() => startEdit('customer')}>{currentReport.customer}</p>
                      )}
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-3 col-span-2 md:col-span-1">
                      <p className="text-xs text-slate-400 mb-1">{t('fields.vendor')}</p>
                      {editingField === 'vendor' ? (
                        <input value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-slate-600 rounded px-2 py-1" autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                      ) : (
                        <p className="font-medium cursor-pointer hover:text-blue-400 truncate" onClick={() => startEdit('vendor')}>{currentReport.vendor}</p>
                      )}
                    </div>
                  </div>

                  {/* 疵点详情 */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium">{t('app.defectDetails')} ({currentReport.defectDetails.length})</h3>
                      <button
                        onClick={addDefect}
                        className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30 transition-colors"
                      >
                        + {t('app.addDefect')}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {currentReport.defectDetails.map((defect, index) => (
                        <div key={index} className="bg-slate-700/30 rounded-lg p-3 flex items-center gap-3">
                          <span className="text-slate-500 w-6">{index + 1}.</span>
                          <div className="flex-1 grid grid-cols-3 gap-4">
                            {editingDefectIndex === index && editingDefectField === 'description' ? (
                              <input 
                                value={editDefectValue} 
                                onChange={e => setEditDefectValue(e.target.value)} 
                                className="col-span-2 bg-slate-600 rounded px-2 py-1" 
                                autoFocus 
                                onKeyDown={e => e.key === 'Enter' && saveDefectEdit()}
                              />
                            ) : (
                              <span 
                                className="col-span-2 cursor-pointer hover:text-blue-400" 
                                onClick={() => startEditDefect(index, 'description', defect.description)}
                              >
                                {defect.description}
                              </span>
                            )}
                            {editingDefectIndex === index && editingDefectField === 'count' ? (
                              <input 
                                value={editDefectValue} 
                                onChange={e => setEditDefectValue(e.target.value)} 
                                className="bg-slate-600 rounded px-2 py-1 text-center" 
                                autoFocus 
                                onKeyDown={e => e.key === 'Enter' && saveDefectEdit()}
                              />
                            ) : (
                              <span 
                                className="text-center cursor-pointer hover:text-blue-400"
                                onClick={() => startEditDefect(index, 'count', defect.count)}
                              >
                                {defect.count} ({defect.rate})
                              </span>
                            )}
                          </div>
                          <button 
                            onClick={() => deleteDefect(index)}
                            className="p-1 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 生成邮件按钮 */}
                  <button
                    onClick={handleGenerateEmail}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl font-medium flex items-center justify-center gap-2 hover:from-blue-500 hover:to-purple-500"
                  >
                    <Mail className="w-5 h-5" />
                    {t('app.generateEmail')}
                  </button>
                  
                  {emailStatus === 'success' && (
                    <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-green-400 text-sm">{t('app.emailSuccess')}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-slate-800 rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-700/50 transition-colors"
                >
                  <Upload className="w-16 h-16 text-slate-600 mb-4" />
                  <p className="text-slate-400 text-lg mb-2">{t('app.uploadPrompt')}</p>
                  <p className="text-slate-500 text-sm">{t('app.uploadHint')}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 邮件模板弹窗 */}
      {showTemplates && (
        <EmailTemplates 
          onClose={() => setShowTemplates(false)} 
          onSelectTemplate={setCurrentTemplate}
        />
      )}

      {/* 缺陷判定校准系统 */}
      {showCalibration && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCalibration(false)} />
          <div className="absolute inset-4 bg-slate-900 rounded-xl overflow-hidden shadow-2xl">
            <div className="h-full overflow-auto">
              <CalibrationSystem />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
