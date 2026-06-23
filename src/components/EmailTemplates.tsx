import { useState, useEffect } from 'react'
import { X, Plus, Edit2, Trash2, Check } from 'lucide-react'

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  isDefault?: boolean
}

interface EmailTemplatesProps {
  onClose: () => void
  onSelectTemplate: (template: EmailTemplate) => void
}

const STORAGE_KEY = 'email_templates'

const DEFAULT_TEMPLATE: EmailTemplate = {
  id: 'default',
  name: '默认模板',
  subject: 'Pending report- {customer} / {vendor}-{styleNo}/{poNo}/{itemNo}',
  body: `Dear      ,

Re, Customer/Vendor: {customer} / {vendor}

Style#: {styleNo}
PO#: {poNo}
Item#: {itemNo}
Delivered Qty: {deliveredQty}
Expected Ship Date: {shipDate}
Total Inspection Qty: {inspectionQty}

---

We found the below mentioned issues during AQL inspection.

{defectList}

I will pass you demos, sealing sample & qc file, please kindly check with QA and advise your comments.
Once all issues are confirmed ok, the goods can be released directly, thanks.`,
  isDefault: true
}

export function EmailTemplates({ onClose, onSelectTemplate }: EmailTemplatesProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      setTemplates([DEFAULT_TEMPLATE, ...JSON.parse(saved)])
    } else {
      setTemplates([DEFAULT_TEMPLATE])
    }
  }, [])

  const saveTemplates = (newTemplates: EmailTemplate[]) => {
    const customTemplates = newTemplates.filter(t => !t.isDefault)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customTemplates))
    setTemplates(newTemplates)
  }

  const handleCreate = () => {
    setIsCreating(true)
    setEditingTemplate({
      id: Date.now().toString(),
      name: '',
      subject: '',
      body: ''
    })
  }

  const handleSave = () => {
    if (!editingTemplate?.name.trim()) return

    if (isCreating) {
      saveTemplates([...templates, editingTemplate])
      setIsCreating(false)
    } else {
      const updated = templates.map(t => 
        t.id === editingTemplate.id ? editingTemplate : t
      )
      saveTemplates(updated)
    }
    setEditingTemplate(null)
  }

  const handleDelete = (id: string) => {
    if (id === 'default') return
    const updated = templates.filter(t => t.id !== id)
    saveTemplates(updated)
  }

  const variablesHelp = `
可用变量：
{customer} - 客户名称
{vendor} - 供应商名称
{styleNo} - Style编号
{poNo} - PO编号
{itemNo} - Item编号
{deliveredQty} - 交货数量
{shipDate} - 发货日期
{inspectionQty} - 检验数量
{defectList} - 疵点列表
`

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-bold">邮件模板管理</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* 模板列表 */}
          <div className="w-1/3 border-r border-slate-700 overflow-y-auto">
            <div className="p-4">
              <button
                onClick={handleCreate}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center justify-center gap-2 mb-4"
              >
                <Plus className="w-4 h-4" />
                新建模板
              </button>

              <div className="space-y-2">
                {templates.map(template => (
                  <div
                    key={template.id}
                    onClick={() => !isCreating && setEditingTemplate(template)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      editingTemplate?.id === template.id
                        ? 'bg-blue-600/20 border border-blue-500/50'
                        : 'bg-slate-700/50 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{template.name}</span>
                      {template.isDefault && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                          默认
                        </span>
                      )}
                    </div>
                    {!template.isDefault && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(template.id)
                        }}
                        className="mt-2 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        删除
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 编辑区域 */}
          <div className="flex-1 overflow-y-auto p-4">
            {editingTemplate ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">模板名称</label>
                  <input
                    type="text"
                    value={editingTemplate.name}
                    onChange={e => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="输入模板名称"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">邮件主题</label>
                  <input
                    type="text"
                    value={editingTemplate.subject}
                    onChange={e => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="输入邮件主题"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">邮件正文</label>
                  <textarea
                    value={editingTemplate.body}
                    onChange={e => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 h-64 font-mono text-sm"
                    placeholder="输入邮件正文"
                  />
                </div>

                <div className="bg-slate-700/50 rounded-lg p-3 text-xs text-slate-400 whitespace-pre-line">
                  {variablesHelp}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    保存
                  </button>
                  {isCreating && (
                    <button
                      onClick={() => {
                        setIsCreating(false)
                        setEditingTemplate(null)
                      }}
                      className="flex-1 py-2 px-4 bg-slate-600 hover:bg-slate-500 rounded-lg"
                    >
                      取消
                    </button>
                  )}
                </div>

                {!isCreating && editingTemplate && (
                  <button
                    onClick={() => {
                      onSelectTemplate(editingTemplate)
                      onClose()
                    }}
                    className="w-full py-2 px-4 bg-green-600 hover:bg-green-500 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    使用此模板
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center text-slate-500 py-12">
                选择一个模板进行编辑，或创建新模板
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export { DEFAULT_TEMPLATE }
export type { EmailTemplate }
