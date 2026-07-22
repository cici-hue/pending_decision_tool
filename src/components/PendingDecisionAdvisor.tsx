import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Brain, CheckCircle2, XCircle, Loader2, Sparkles } from 'lucide-react'
import type { ReportData } from '../App'

type Suggestion = 'ACCEPT' | 'NOT_ACCEPT'

interface MockAdvisorResult {
  suggestion: Suggestion
  similarCases: string[]
  reasoning: string
}

/**
 * Pending Decision Advisor
 *
 * Mock 实现：根据当前报告的 defectDetails 数量和缺陷率，
 * 简单模拟 AI 给出 ACCEPT / NOT_ACCEPT 建议，并列出「相似历史案例」。
 *
 * 未来接数据库时，把 findSimilarCases() 和 reasoning 改为：
 *   - 后端 API 检索历史 pending 决策数据
 *   - 用 DeepSeek LLM 基于相似案例生成 reasoning
 */
function generateMockAdvice(report: ReportData): MockAdvisorResult {
  const defects = report.defectDetails || []
  const inspectionQty = report.inspectionQty || 1
  const totalDefects = defects.reduce((sum, d) => sum + (d.count || 0), 0)
  const totalRate = (totalDefects / inspectionQty) * 100

  // 简单规则：有「重大缺陷」描述或总缺陷率 > 30% 倾向 NOT_ACCEPT
  const criticalKeywords = ['hole', 'broken', 'tear', 'stain', 'uneven', 'color']
  const hasCritical = defects.some(d =>
    criticalKeywords.some(k => d.description.toLowerCase().includes(k))
  )

  const suggestion: Suggestion =
    hasCritical || totalRate > 30 ? 'NOT_ACCEPT' : 'ACCEPT'

  // Mock 的相似历史案例（未来接数据库时由后端返回）
  const similarCases: string[] = hasCritical
    ? [
        `${report.customer || '同客户'} 在 2025-12 因为类似 ${defects[0]?.description || '染色问题'} pending，最终 NOT_ACCEPT（决策人: Senior QC）`,
        `${report.vendor || '同供应商'} 历史 5 次同类款式 pending，3 次 NOT_ACCEPT，2 次 ACCEPT`
      ]
    : [
        `${report.customer || '同客户'} 在 2025-10 收到过类似 minor 缺陷的 pending，决策 ACCEPT（决策人: QC Manager）`,
        `${report.vendor || '同供应商'} 近 3 个月类似缺陷率均 < 10%，历史倾向 ACCEPT`
      ]

  const reasoning = hasCritical
    ? `AI 基于以下原因给出 NOT_ACCEPT 建议：1) 检测到关键缺陷类型（${defects.find(d => criticalKeywords.some(k => d.description.toLowerCase().includes(k)))?.description || 'critical issue'}）；2) 总缺陷率 ${totalRate.toFixed(1)}% 超过 30% 警戒线；3) ${report.customer || '该客户'} 历史对同类问题容忍度较低。建议人工复核后再做最终决定。`
    : `AI 基于以下原因给出 ACCEPT 建议：1) 总缺陷率 ${totalRate.toFixed(1)}% 处于可接受范围（<30%）；2) 未发现关键缺陷（破洞/断线/严重污渍）；3) ${report.vendor || '该供应商'} 近期质量表现稳定。建议人工确认后放行。`

  return { suggestion, similarCases, reasoning }
}

interface Props {
  report: ReportData
}

export function PendingDecisionAdvisor({ report }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MockAdvisorResult | null>(null)

  const handleGetAdvice = () => {
    setLoading(true)
    // Mock：模拟 800ms 网络延迟
    setTimeout(() => {
      setResult(generateMockAdvice(report))
      setLoading(false)
    }, 800)
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-medium flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            <span>{t('advisor.title')}</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('advisor.disclaimer')}
          </p>
        </div>
        <button
          onClick={handleGetAdvice}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 text-purple-300 rounded-lg text-sm hover:bg-purple-600/30 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {loading ? t('advisor.thinking') : t('advisor.getAdvice')}
        </button>
      </div>

      {result && (
        <div className="bg-slate-700/30 rounded-lg p-4 space-y-3">
          {/* 决策建议 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{t('advisor.suggestion')}:</span>
            {result.suggestion === 'ACCEPT' ? (
              <span className="flex items-center gap-1 text-green-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                ACCEPT
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-400 font-semibold">
                <XCircle className="w-4 h-4" />
                NOT ACCEPT
              </span>
            )}
          </div>

          {/* 相似案例 */}
          <div>
            <p className="text-xs text-slate-400 mb-1.5">{t('advisor.similarCases')}:</p>
            <ul className="space-y-1 text-sm text-slate-300">
              {result.similarCases.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 决策理由 */}
          <div>
            <p className="text-xs text-slate-400 mb-1.5">{t('advisor.reasoning')}:</p>
            <p className="text-sm text-slate-200 leading-relaxed">{result.reasoning}</p>
          </div>
        </div>
      )}
    </div>
  )
}
